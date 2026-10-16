import { setTimeout as delay } from "node:timers/promises";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import {
  createWalletClient,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hash,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { arc, publicClient } from "../chains";
import { circleBlockchain, isLocal, need } from "./env";
import { UserError, explainRevert } from "./errors";

/** A wallet we sign for: a Circle developer-controlled wallet, or an anvil account locally. */
export type Signer = { address: Address; walletId?: string | null };

export type Call<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">> = {
  address: Address;
  abi: abi;
  functionName: fn;
  args: ContractFunctionArgs<abi, "nonpayable", fn>;
};

export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
/** Anvil account indexes used by contracts/script/DeployLocal.s.sol. */
export const ANVIL = { agent: 1, approver: 2, provider: 3, coverer: 4, family: 5 } as const;
export const anvilAccount = (index: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });

let circle: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;
export function circleClient() {
  circle ??= initiateDeveloperControlledWalletsClient({ apiKey: need("CIRCLE_API_KEY"), entitySecret: need("CIRCLE_ENTITY_SECRET") });
  return circle;
}

/** The agent's wallet. Holds only gas. */
export function agentSigner(): Signer {
  if (isLocal) return { address: anvilAccount(ANVIL.agent).address };
  return { address: need("AGENT_ADDRESS") as Address, walletId: process.env.AGENT_WALLET_ID ?? null };
}

async function waitForCircle(txId: string): Promise<Hash> {
  const client = circleClient();
  for (let i = 0; i < 90; i++) {
    const tx = (await client.getTransaction({ id: txId })).data?.transaction;
    if (tx?.state === "COMPLETE" && tx.txHash) return tx.txHash as Hash;
    if (tx?.state === "FAILED" || tx?.state === "CANCELLED" || tx?.state === "DENIED") {
      throw new UserError(`The transaction failed onchain (${tx.errorReason ?? tx.state}).`, 502);
    }
    await delay(2000);
  }
  throw new UserError("The transaction is taking longer than expected. It may still confirm; check the explorer.", 504);
}

/**
 * Simulates, sends and waits for a contract call. Throws a UserError with a plain reason on a revert.
 * Every caller writes its decision row before calling this, and calls are safe to retry: the contract
 * rejects a repeated charge hash, and fund/discharge check status.
 */
export async function send<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">>(
  signer: Signer,
  call: Call<abi, fn>,
): Promise<Hash> {
  try {
    // Simulating first gives a decoded revert reason before any gas is spent.
    await publicClient.simulateContract({ ...call, account: signer.address } as never);
  } catch (err) {
    throw new UserError(explainRevert(err) ?? "The contract rejected this transaction.", 409);
  }

  let hash: Hash;
  if (isLocal) {
    const index = Object.values(ANVIL).find((i) => anvilAccount(i).address.toLowerCase() === signer.address.toLowerCase());
    if (index === undefined) throw new Error(`No local key for ${signer.address}.`);
    const wallet = createWalletClient({ account: anvilAccount(index), chain: arc, transport: http() });
    hash = await wallet.writeContract({ ...call, chain: arc } as never);
  } else {
    // Raw calldata from viem, so Circle signs exactly what we simulated.
    const callData = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as never);
    const from = signer.walletId
      ? { walletId: signer.walletId }
      : { walletAddress: signer.address, blockchain: circleBlockchain() };
    const res = await circleClient().createContractExecutionTransaction({
      ...from,
      contractAddress: call.address,
      callData,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });
    const id = res.data?.id;
    if (!id) throw new UserError("Circle didn't accept the transaction. Try again in a moment.", 502);
    hash = await waitForCircle(id);
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new UserError("The transaction reverted onchain.", 409);
  return hash;
}
