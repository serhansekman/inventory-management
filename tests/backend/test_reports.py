"""
Tests for report API endpoints (quarterly and monthly trends).
"""
import pytest


REPORT_ENDPOINTS = ["/api/reports/quarterly", "/api/reports/monthly-trends"]


def _orders(client, query=""):
    """Fetch orders with the same query string a report is given."""
    return client.get(f"/api/orders{query}").json()


class TestReportsEndpoints:
    """Test suite for report endpoints."""

    def test_get_quarterly_reports(self, client):
        """Test the quarterly report structure."""
        response = client.get("/api/reports/quarterly")
        assert response.status_code == 200

        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for quarter in data:
            for key in ["quarter", "total_orders", "total_revenue", "delivered_orders",
                        "avg_order_value", "fulfillment_rate"]:
                assert key in quarter

    def test_quarterly_reports_sorted_chronologically(self, client):
        """Test that quarters are returned in date order."""
        data = client.get("/api/reports/quarterly").json()
        keys = [(q["quarter"][3:], q["quarter"][:2]) for q in data]
        assert keys == sorted(keys)

    def test_get_monthly_trends(self, client):
        """Test the monthly trends structure and order."""
        response = client.get("/api/reports/monthly-trends")
        assert response.status_code == 200

        data = response.json()
        assert len(data) > 0
        for month in data:
            for key in ["month", "order_count", "revenue", "delivered_count"]:
                assert key in month
        months = [m["month"] for m in data]
        assert months == sorted(months)

    def test_unfiltered_reports_cover_all_orders(self, client):
        """Test that unfiltered totals match the raw orders."""
        all_orders = _orders(client)
        quarterly = client.get("/api/reports/quarterly").json()
        monthly = client.get("/api/reports/monthly-trends").json()

        assert sum(q["total_orders"] for q in quarterly) == len(all_orders)
        assert sum(m["order_count"] for m in monthly) == len(all_orders)
        assert abs(sum(m["revenue"] for m in monthly) - sum(o["total_value"] for o in all_orders)) < 0.01

    @pytest.mark.parametrize("query", [
        "?warehouse=Tokyo",
        "?category=Sensors",
        "?status=Delivered",
        "?month=2025-03",
        "?month=Q2-2025",
        "?warehouse=London&category=Power Supplies&status=Shipped",
    ])
    def test_reports_respect_filters(self, client, query):
        """Test that each report matches /api/orders under the same filters."""
        filtered = _orders(client, query)
        assert len(filtered) < len(_orders(client)), "filter should narrow the data set"

        quarterly = client.get(f"/api/reports/quarterly{query}").json()
        monthly = client.get(f"/api/reports/monthly-trends{query}").json()

        assert sum(q["total_orders"] for q in quarterly) == len(filtered)
        assert sum(m["order_count"] for m in monthly) == len(filtered)
        assert abs(sum(m["revenue"] for m in monthly) - sum(o["total_value"] for o in filtered)) < 0.01

    def test_month_filter_limits_monthly_trends(self, client):
        """Test that a single-month filter returns only that month."""
        data = client.get("/api/reports/monthly-trends?month=2025-03").json()
        assert [m["month"] for m in data] == ["2025-03"]

    def test_quarter_filter_limits_quarterly_report(self, client):
        """Test that a quarter filter returns only that quarter."""
        data = client.get("/api/reports/quarterly?month=Q2-2025").json()
        assert [q["quarter"] for q in data] == ["Q2-2025"]

    @pytest.mark.parametrize("endpoint", REPORT_ENDPOINTS)
    def test_all_value_means_no_filter(self, client, endpoint):
        """Test that 'all' behaves like an omitted filter."""
        unfiltered = client.get(endpoint).json()
        explicit_all = client.get(f"{endpoint}?warehouse=all&category=all&status=all&month=all").json()
        assert explicit_all == unfiltered

    @pytest.mark.parametrize("endpoint", REPORT_ENDPOINTS)
    def test_filter_with_no_matches_returns_empty_list(self, client, endpoint):
        """Test that a filter matching nothing returns an empty list, not an error."""
        response = client.get(f"{endpoint}?warehouse=Atlantis")
        assert response.status_code == 200
        assert response.json() == []

    def test_fulfillment_rate_calculation(self, client):
        """Test fulfillment rate and average order value per quarter."""
        for q in client.get("/api/reports/quarterly").json():
            assert q["fulfillment_rate"] == round(q["delivered_orders"] / q["total_orders"] * 100, 1)
            assert abs(q["avg_order_value"] - q["total_revenue"] / q["total_orders"]) < 0.01
