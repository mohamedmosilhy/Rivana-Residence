export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests, e.g. postgresql://user@127.0.0.1:5432/rivana_test",
    );
  }

  const url = new URL(value);
  const database = url.pathname.replace(/^\//, "");
  // The global setup drops and recreates this database. Refuse anything that
  // is not unmistakably disposable.
  if (!/_test$/.test(database)) {
    throw new Error(
      `Refusing to reset "${database}": the test database name must end in "_test".`,
    );
  }

  return { url: value, database };
}
