"""
Tests for restocking order API endpoints.
"""
import pytest

import mock_data


@pytest.fixture(autouse=True)
def clear_restocking_orders():
    """Reset the shared in-memory order list so tests do not leak into each other."""
    # main.py imports this same list object, so it must be cleared in place, not rebound
    mock_data.restocking_orders.clear()
    yield
    mock_data.restocking_orders.clear()


def _forecasts(client):
    """Fetch demand forecasts keyed by SKU."""
    return {f["item_sku"]: f for f in client.get("/api/demand").json()}


class TestRestockingOrderEndpoints:
    """Test suite for restocking order endpoints."""

    def test_get_restocking_orders_empty(self, client):
        """Test that no orders exist before anything is submitted."""
        response = client.get("/api/restocking-orders")
        assert response.status_code == 200
        assert response.json() == []

    def test_demand_forecasts_include_cost_and_lead_time(self, client):
        """Test that demand forecasts expose the fields restocking needs."""
        data = client.get("/api/demand").json()
        assert len(data) > 0

        for forecast in data:
            assert isinstance(forecast["unit_cost"], (int, float))
            assert forecast["unit_cost"] > 0
            assert isinstance(forecast["lead_time_days"], int)
            assert forecast["lead_time_days"] > 0

    def test_create_restocking_order(self, client):
        """Test submitting a valid restocking order."""
        forecasts = _forecasts(client)
        payload = {
            "budget": 200000,
            "items": [
                {"item_sku": "WDG-001", "quantity": 100},
                {"item_sku": "FLT-405", "quantity": 50},
            ],
        }
        response = client.post("/api/restocking-orders", json=payload)
        assert response.status_code == 201

        order = response.json()
        assert order["order_number"].startswith("RST-")
        assert order["status"] == "Submitted"
        assert order["budget"] == 200000
        assert len(order["items"]) == 2

        for key in ["id", "total_value", "submitted_date", "lead_time_days", "expected_delivery"]:
            assert key in order

        expected_total = 100 * forecasts["WDG-001"]["unit_cost"] + 50 * forecasts["FLT-405"]["unit_cost"]
        assert abs(order["total_value"] - expected_total) < 0.01

    def test_order_lead_time_is_longest_item(self, client):
        """Test that the order lead time is the maximum across its items."""
        forecasts = _forecasts(client)
        skus = ["WDG-001", "FLT-405"]
        payload = {"budget": 1000000, "items": [{"item_sku": s, "quantity": 1} for s in skus]}

        order = client.post("/api/restocking-orders", json=payload).json()
        assert order["lead_time_days"] == max(forecasts[s]["lead_time_days"] for s in skus)

    def test_server_ignores_client_prices(self, client):
        """Test that unit cost comes from server data, not from the request."""
        forecasts = _forecasts(client)
        payload = {
            "budget": 100000,
            "items": [{"item_sku": "WDG-001", "quantity": 2, "unit_cost": 0.01}],
        }
        order = client.post("/api/restocking-orders", json=payload).json()
        assert order["items"][0]["unit_cost"] == forecasts["WDG-001"]["unit_cost"]

    def test_created_order_appears_in_list_newest_first(self, client):
        """Test that submitted orders are listed with the newest first."""
        for sku in ["WDG-001", "FLT-405"]:
            client.post(
                "/api/restocking-orders",
                json={"budget": 1000000, "items": [{"item_sku": sku, "quantity": 1}]},
            )

        data = client.get("/api/restocking-orders").json()
        assert len(data) == 2
        assert data[0]["items"][0]["item_sku"] == "FLT-405"
        assert data[1]["items"][0]["item_sku"] == "WDG-001"
        assert data[0]["order_number"] != data[1]["order_number"]

    def test_order_does_not_change_main_orders(self, client):
        """Test that restocking orders stay out of the customer orders and dashboard."""
        orders_before = len(client.get("/api/orders").json())
        summary_before = client.get("/api/dashboard/summary").json()

        client.post(
            "/api/restocking-orders",
            json={"budget": 1000000, "items": [{"item_sku": "WDG-001", "quantity": 10}]},
        )

        assert len(client.get("/api/orders").json()) == orders_before
        assert client.get("/api/dashboard/summary").json() == summary_before

    def test_create_order_with_no_items(self, client):
        """Test that an order with no items is rejected."""
        response = client.post("/api/restocking-orders", json={"budget": 1000, "items": []})
        assert response.status_code == 400
        assert "detail" in response.json()

    def test_create_order_unknown_sku(self, client):
        """Test that an unknown SKU returns 404."""
        response = client.post(
            "/api/restocking-orders",
            json={"budget": 1000, "items": [{"item_sku": "NOPE-000", "quantity": 1}]},
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.parametrize("quantity", [0, -5])
    def test_create_order_invalid_quantity(self, client, quantity):
        """Test that zero or negative quantities are rejected."""
        response = client.post(
            "/api/restocking-orders",
            json={"budget": 100000, "items": [{"item_sku": "WDG-001", "quantity": quantity}]},
        )
        assert response.status_code == 400

    def test_create_order_over_budget(self, client):
        """Test that an order costing more than the budget is rejected."""
        response = client.post(
            "/api/restocking-orders",
            json={"budget": 10, "items": [{"item_sku": "WDG-001", "quantity": 1}]},
        )
        assert response.status_code == 400
        assert "budget" in response.json()["detail"].lower()
        assert client.get("/api/restocking-orders").json() == []

    def test_create_order_missing_fields(self, client):
        """Test that a malformed body returns a validation error."""
        response = client.post("/api/restocking-orders", json={"items": []})
        assert response.status_code == 422
