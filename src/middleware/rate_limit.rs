//! Fixed-window rate limiter with per-IP tracking.
//!
//! Provides a [`RateLimiter`] that tracks request counts per IP address
//! within a configurable time window, and an axum middleware function
//! to enforce the limit on specific routes.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};

use crate::error::AppError;

/// Tracks the request count within the current time window.
struct WindowEntry {
    count: u64,
    window_start: Instant,
}

/// A fixed-window rate limiter keyed by client IP address.
///
/// Each IP gets `max_requests` allowed per `window` duration.
/// When the window expires, the counter resets automatically.
#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<Mutex<HashMap<IpAddr, WindowEntry>>>,
    max_requests: u64,
    window: Duration,
}

impl RateLimiter {
    /// Creates a new rate limiter with the given limits.
    pub fn new(max_requests: u64, window: Duration) -> Self {
        Self {
            state: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window,
        }
    }

    /// Checks whether the given IP is within the rate limit.
    ///
    /// Increments the request counter and returns `Ok(())` if allowed,
    /// or `Err(AppError::TooManyRequests)` if the limit is exceeded.
    pub fn check(&self, ip: IpAddr) -> Result<(), AppError> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();

        let entry = state.entry(ip).or_insert(WindowEntry {
            count: 0,
            window_start: now,
        });

        // Reset window if expired
        if now.duration_since(entry.window_start) >= self.window {
            entry.count = 0;
            entry.window_start = now;
        }

        entry.count += 1;

        if entry.count > self.max_requests {
            return Err(AppError::TooManyRequests("rate limit exceeded".into()));
        }

        Ok(())
    }
}

/// Extracts the client IP from the request.
///
/// Checks `X-Forwarded-For` first (for reverse proxies like Fly.io),
/// then falls back to `127.0.0.1`.
fn extract_ip(request: &Request) -> IpAddr {
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST))
}

/// Axum middleware that enforces a rate limit per client IP.
///
/// Apply to routes via `axum::middleware::from_fn_with_state`.
pub async fn rate_limit(
    State(limiter): State<RateLimiter>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let ip = extract_ip(&request);
    limiter.check(ip)?;
    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn test_check_allows_requests_within_limit() {
        let limiter = RateLimiter::new(3, Duration::from_secs(60));
        let ip = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));

        assert!(limiter.check(ip).is_ok());
        assert!(limiter.check(ip).is_ok());
        assert!(limiter.check(ip).is_ok());
    }

    #[test]
    fn test_check_rejects_requests_over_limit() {
        let limiter = RateLimiter::new(2, Duration::from_secs(60));
        let ip = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));

        assert!(limiter.check(ip).is_ok());
        assert!(limiter.check(ip).is_ok());

        let result = limiter.check(ip);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("rate limit"),
            "Error should mention rate limit"
        );
    }

    #[test]
    fn test_check_tracks_ips_independently() {
        let limiter = RateLimiter::new(1, Duration::from_secs(60));
        let ip_a = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let ip_b = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));

        assert!(limiter.check(ip_a).is_ok());
        assert!(limiter.check(ip_b).is_ok());

        // Both exhausted now
        assert!(limiter.check(ip_a).is_err());
        assert!(limiter.check(ip_b).is_err());
    }

    #[test]
    fn test_check_resets_after_window_expires() {
        let limiter = RateLimiter::new(1, Duration::from_millis(1));
        let ip = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 3));

        assert!(limiter.check(ip).is_ok());
        assert!(limiter.check(ip).is_err());

        // Wait for window to expire
        std::thread::sleep(Duration::from_millis(5));

        assert!(limiter.check(ip).is_ok(), "Should allow after window reset");
    }

    #[test]
    fn test_extract_ip_from_x_forwarded_for() {
        let request = Request::builder()
            .header("x-forwarded-for", "203.0.113.50, 70.41.3.18")
            .body(axum::body::Body::empty())
            .unwrap();

        let ip = extract_ip(&request);
        assert_eq!(ip, IpAddr::V4(Ipv4Addr::new(203, 0, 113, 50)));
    }

    #[test]
    fn test_extract_ip_falls_back_to_localhost() {
        let request = Request::builder().body(axum::body::Body::empty()).unwrap();

        let ip = extract_ip(&request);
        assert_eq!(ip, IpAddr::V4(Ipv4Addr::LOCALHOST));
    }
}
