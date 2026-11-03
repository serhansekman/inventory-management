<template>
  <div class="reports">
    <div class="page-header">
      <h2>{{ t("reports.title") }}</h2>
      <p>{{ t("reports.description") }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t("reports.loading") }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="isEmpty" class="loading">{{ t("reports.empty") }}</div>
    <div v-else>
      <!-- Quarterly Performance -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t("reports.quarterly.title") }}</h3>
        </div>
        <div class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th scope="col">{{ t("reports.quarterly.quarter") }}</th>
                <th scope="col">{{ t("reports.quarterly.totalOrders") }}</th>
                <th scope="col">{{ t("reports.quarterly.totalRevenue") }}</th>
                <th scope="col">{{ t("reports.quarterly.avgOrderValue") }}</th>
                <th scope="col">
                  {{ t("reports.quarterly.fulfillmentRate") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in quarterlyData" :key="q.quarter">
                <td>
                  <strong>{{ q.quarter }}</strong>
                </td>
                <td>{{ q.total_orders }}</td>
                <td>{{ formatCurrency(q.total_revenue, currentCurrency) }}</td>
                <td>
                  {{ formatCurrency(q.avg_order_value, currentCurrency) }}
                </td>
                <td>
                  <span :class="getFulfillmentClass(q.fulfillment_rate)">
                    {{ q.fulfillment_rate }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Monthly Trends Chart -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t("reports.trend.title") }}</h3>
        </div>
        <div class="chart-container">
          <div class="bar-chart" role="img" :aria-label="chartAriaLabel">
            <div
              v-for="row in monthlyRows"
              :key="row.month"
              class="bar-wrapper"
            >
              <div class="bar-container">
                <div
                  class="bar"
                  :style="{ height: row.barHeight + 'px' }"
                  :title="row.revenueText"
                  :aria-label="
                    t('reports.trend.barLabel', {
                      month: row.label,
                      amount: row.revenueText,
                    })
                  "
                ></div>
              </div>
              <div class="bar-label" aria-hidden="true">{{ row.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Month-over-Month Comparison -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t("reports.mom.title") }}</h3>
        </div>
        <div class="table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th scope="col">{{ t("reports.mom.month") }}</th>
                <th scope="col">{{ t("reports.mom.orders") }}</th>
                <th scope="col">{{ t("reports.mom.revenue") }}</th>
                <th scope="col">{{ t("reports.mom.change") }}</th>
                <th scope="col">{{ t("reports.mom.growthRate") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in monthlyRows" :key="row.month">
                <td>
                  <strong>{{ row.label }}</strong>
                </td>
                <td>{{ row.order_count }}</td>
                <td>{{ row.revenueText }}</td>
                <td>
                  <span :class="row.changeClass">{{ row.changeText }}</span>
                </td>
                <td>
                  <span :class="row.changeClass">{{ row.growthText }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">{{ revenueLabel }}</div>
          <div class="stat-value">
            {{ formatCurrency(totalRevenue, currentCurrency) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            {{ t("reports.stats.avgMonthlyRevenue") }}
          </div>
          <div class="stat-value">
            {{ formatCurrency(avgMonthlyRevenue, currentCurrency) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ ordersLabel }}</div>
          <div class="stat-value">{{ totalOrders }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t("reports.stats.bestQuarter") }}</div>
          <div class="stat-value">{{ bestQuarter }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from "vue";
import { api } from "../api";
import { useFilters } from "../composables/useFilters";
import { useI18n } from "../composables/useI18n";
import { formatCurrency } from "../utils/currency";

export default {
  name: "Reports",
  setup() {
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      getCurrentFilters,
    } = useFilters();
    const { t, currentCurrency, currentLocale } = useI18n();

    // Raw data
    const loading = ref(true);
    const error = ref(null);
    const quarterlyData = ref([]);
    const monthlyData = ref([]);

    const loadData = async () => {
      try {
        loading.value = true;
        // Reset so a successful reload clears a previous failure
        error.value = null;
        const filters = getCurrentFilters();
        // Independent requests: fetch in parallel
        const [quarterly, monthly] = await Promise.all([
          api.getQuarterlyReports(filters),
          api.getMonthlyTrends(filters),
        ]);
        quarterlyData.value = quarterly;
        monthlyData.value = monthly;
      } catch (err) {
        error.value = t("reports.error");
        console.error("Error loading reports:", err);
      } finally {
        loading.value = false;
      }
    };

    // Format 'YYYY-MM' using the active locale; fall back to the raw string
    // if it cannot be parsed (never throw on bad API data).
    const formatMonth = (monthStr) => {
      const date = new Date(`${monthStr}-01T00:00:00`);
      if (isNaN(date.getTime())) return monthStr;
      const locale = currentLocale.value === "ja" ? "ja-JP" : "en-US";
      return date.toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
      });
    };

    const isEmpty = computed(
      () => quarterlyData.value.length === 0 && monthlyData.value.length === 0,
    );

    // Max revenue computed once instead of per bar
    const maxRevenue = computed(() =>
      monthlyData.value.reduce((max, m) => Math.max(max, m.revenue), 0),
    );

    // Chart plot area is 200px tall
    const CHART_HEIGHT = 200;

    // Table/chart rows with change vs. the previous month in the list
    const monthlyRows = computed(() =>
      monthlyData.value.map((m, i) => {
        const prev = i > 0 ? monthlyData.value[i - 1] : null;
        const row = {
          ...m,
          label: formatMonth(m.month),
          revenueText: formatCurrency(m.revenue, currentCurrency.value),
          barHeight:
            maxRevenue.value > 0
              ? (m.revenue / maxRevenue.value) * CHART_HEIGHT
              : 0,
          changeText: t("reports.noChange"),
          growthText: t("reports.noChange"),
          changeClass: "",
        };
        if (prev) {
          const change = m.revenue - prev.revenue;
          const sign = change > 0 ? "+" : change < 0 ? "-" : "";
          row.changeText =
            sign + formatCurrency(Math.abs(change), currentCurrency.value);
          row.changeClass =
            change > 0
              ? "positive-change"
              : change < 0
                ? "negative-change"
                : "";
          // Growth is undefined when the previous month had no revenue
          if (prev.revenue === 0) {
            row.growthText = t("reports.notAvailable");
          } else {
            const rate = (change / prev.revenue) * 100;
            row.growthText = `${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`;
          }
        }
        return row;
      }),
    );

    const totalRevenue = computed(() =>
      monthlyData.value.reduce((sum, m) => sum + m.revenue, 0),
    );
    const avgMonthlyRevenue = computed(() =>
      monthlyData.value.length > 0
        ? totalRevenue.value / monthlyData.value.length
        : 0,
    );
    const totalOrders = computed(() =>
      monthlyData.value.reduce((sum, m) => sum + m.order_count, 0),
    );
    // Placeholder dash when there is no data or no revenue
    const bestQuarter = computed(() => {
      let best = null;
      for (const q of quarterlyData.value) {
        if (!best || q.total_revenue > best.total_revenue) best = q;
      }
      return best && best.total_revenue > 0
        ? best.quarter
        : t("reports.noChange");
    });

    // "(YTD)" is only accurate when no period filter narrows the range
    const revenueLabel = computed(() =>
      selectedPeriod.value === "all"
        ? t("reports.stats.totalRevenueYtd")
        : t("reports.stats.totalRevenue"),
    );
    const ordersLabel = computed(() =>
      selectedPeriod.value === "all"
        ? t("reports.stats.totalOrdersYtd")
        : t("reports.stats.totalOrders"),
    );

    const chartAriaLabel = computed(() => {
      const rows = monthlyRows.value;
      if (rows.length === 0) return t("reports.empty");
      const summary = `${rows[0].label} - ${rows[rows.length - 1].label}, ${t(
        "reports.stats.totalRevenue",
      )} ${formatCurrency(totalRevenue.value, currentCurrency.value)}`;
      return t("reports.trend.chartLabel", { summary });
    });

    const getFulfillmentClass = (rate) => {
      if (rate >= 90) return "badge success";
      if (rate >= 75) return "badge warning";
      return "badge danger";
    };

    onMounted(() => {
      loadData();
    });

    // Reload when any global filter changes
    watch(
      [selectedPeriod, selectedLocation, selectedCategory, selectedStatus],
      () => {
        loadData();
      },
    );

    return {
      t,
      currentCurrency,
      formatCurrency,
      loading,
      error,
      isEmpty,
      quarterlyData,
      monthlyRows,
      totalRevenue,
      avgMonthlyRevenue,
      totalOrders,
      bestQuarter,
      revenueLabel,
      ordersLabel,
      chartAriaLabel,
      getFulfillmentClass,
    };
  },
};
</script>

<style scoped>
.reports {
  padding: 0;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
}

.reports-table th {
  background: #f8fafc;
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
}

.reports-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.reports-table tr:hover {
  background: #f8fafc;
}

.chart-container {
  padding: 2rem 1rem;
  min-height: 300px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 250px;
  gap: 0.5rem;
}

.bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  max-width: 80px;
}

.bar-container {
  height: 200px;
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.bar {
  width: 100%;
  background: linear-gradient(to top, #3b82f6, #60a5fa);
  border-radius: 4px 4px 0 0;
  transition: all 0.3s;
  cursor: pointer;
}

.bar:hover {
  background: linear-gradient(to top, #2563eb, #3b82f6);
}

.bar-label {
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
  transform: rotate(-45deg);
  white-space: nowrap;
  margin-top: 1.5rem;
}

.positive-change {
  color: #16a34a;
  font-weight: 600;
}

.negative-change {
  color: #dc2626;
  font-weight: 600;
}
</style>
