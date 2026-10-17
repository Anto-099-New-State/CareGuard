-- Currency conversions get their own decision kind, so the decision log explains every conversion like every charge:
-- the route, the quote, what was received, and whether it was within the quoted minimum.

alter type decision_kind add value if not exists 'fx';
alter type decision_outcome add value if not exists 'converted';
