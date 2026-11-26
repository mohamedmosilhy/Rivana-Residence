# Payment adapters

- Implement `PaymentGateway` from `src/application/payments`. Construct and select adapters in `src/composition/payment-gateway.ts`. Keep reservation rules in the application layer. [Adapter guide](../../../docs/architecture/provider-adapters.md)
- Keep provider requests, credentials, and webhook verification here. Return normalized results. Every refund result must carry the original `refundAttemptKey`. Run `npx vitest run tests/contract/payment-gateway.test.ts` for each adapter.
- The development fake stores checkout and refund records in one process. To exercise the scheduled job against the fake, use the same process or inject a test gateway with the needed result. A separately started CLI has its own fake instance. [Closing evidence](../../../docs/delivery/reports/m9-payments-and-cancellations.md#acceptance-criteria-and-evidence)

_Drafted by /sync from the introducing change, worth a quick human pass._
