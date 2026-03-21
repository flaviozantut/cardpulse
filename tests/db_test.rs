mod common;

async fn table_exists(pool: &sqlx::PgPool, table: &str) -> bool {
    sqlx::query_scalar!(
        "SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        )",
        table
    )
    .fetch_one(pool)
    .await
    .unwrap()
    .unwrap_or(false)
}

/// Verify that the migration runs and all three core tables exist in the test database.
#[tokio::test]
async fn test_migration_creates_users_table() {
    let pool = common::test_pool().await;
    assert!(
        table_exists(&pool, "users").await,
        "table 'users' should exist after migration"
    );
}

#[tokio::test]
async fn test_migration_creates_cards_table() {
    let pool = common::test_pool().await;
    assert!(
        table_exists(&pool, "cards").await,
        "table 'cards' should exist after migration"
    );
}

#[tokio::test]
async fn test_migration_creates_transactions_table() {
    let pool = common::test_pool().await;
    assert!(
        table_exists(&pool, "transactions").await,
        "table 'transactions' should exist after migration"
    );
}
