# Monitoring corrections
- [ ] Inventory: negative warnings, sorting, filters, regularization, report balances and tests.
- [ ] Record already-applied inventory SQL: direct writes to managed migrations are refused; applying it is prohibited by the user.
- [x] Verify and correct expired document preview actions without extending signed-link lifetime; real PDF download and new tab passed after 65 seconds.
- [x] Verify and correct cheque voiding for drafts without replacement; deployed function detaches the reference and preserves draft/audit/VOID reservation.
- [x] Four preview regressions pass; automatic build is clean; resolve only these two findings.
- [ ] Run transactional cheque regression end-to-end: sandbox SQL role cannot execute the protected RPC, so this test requires an authorized database test runner. No existing journal data was changed.