<template>
  <div class="backlog">
    <div class="page-header">
      <h2>{{ t("backlog.title") }}</h2>
      <p>{{ t("backlog.description") }}</p>
      <p class="not-filtered">{{ t("backlog.notFiltered") }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t("backlog.loading") }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="stats-grid">
        <div class="stat-card danger">
          <div class="stat-label">{{ t("backlog.stats.high") }}</div>
          <div class="stat-value">{{ priorityCounts.high }}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">{{ t("backlog.stats.medium") }}</div>
          <div class="stat-value">{{ priorityCounts.medium }}</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">{{ t("backlog.stats.low") }}</div>
          <div class="stat-value">{{ priorityCounts.low }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t("backlog.stats.total") }}</div>
          <div class="stat-value">{{ sortedBacklog.length }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t("backlog.itemsTitle") }}</h3>
        </div>
        <div v-if="sortedBacklog.length === 0" class="empty-state">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="success-icon"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="empty-text">{{ t("backlog.empty") }}</p>
        </div>
        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.orderId") }}
                </th>
                <th scope="col">{{ t("dashboard.inventoryShortages.sku") }}</th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.itemName") }}
                </th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.quantityNeeded") }}
                </th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.quantityAvailable") }}
                </th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.shortage") }}
                </th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.daysDelayed") }}
                </th>
                <th scope="col">
                  {{ t("dashboard.inventoryShortages.priority") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sortedBacklog" :key="item.id">
                <td>
                  <strong>{{ item.order_id }}</strong>
                </td>
                <td>
                  <strong>{{ item.item_sku }}</strong>
                </td>
                <td>{{ translateProductName(item.item_name) }}</td>
                <td>{{ item.quantity_needed }}</td>
                <td>{{ item.quantity_available }}</td>
                <td>
                  <span class="badge danger">
                    {{ shortageLabel(item) }}
                  </span>
                </td>
                <td>
                  <span
                    :class="[
                      'delay',
                      item.days_delayed > 7 ? 'delay-high' : 'delay-low',
                    ]"
                  >
                    {{ daysLabel(item.days_delayed) }}
                  </span>
                </td>
                <td>
                  <span :class="['badge', item.priority]">
                    {{ translatePriority(item.priority) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from "vue";
import { api } from "../api";
import { useI18n } from "../composables/useI18n";

export default {
  name: "Backlog",
  setup() {
    const { t, translateProductName } = useI18n();

    const loading = ref(true);
    const error = ref(null);

    // Backlog is intentionally NOT filtered by the global Location/Category
    // filters: backlog items carry no warehouse or category and their SKUs
    // are not present in inventory, so matching against filtered inventory
    // would drop every item and falsely report "all orders can be fulfilled".
    const allBacklogItems = ref([]);

    const priorityRank = { high: 0, medium: 1, low: 2 };

    // High priority first, then longest delay first. Copy before sorting so
    // the source ref is not mutated.
    const sortedBacklog = computed(() =>
      [...allBacklogItems.value].sort((a, b) => {
        const byPriority =
          (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
        return byPriority || b.days_delayed - a.days_delayed;
      }),
    );

    const priorityCounts = computed(() => {
      const counts = { high: 0, medium: 0, low: 0 };
      for (const item of allBacklogItems.value) {
        if (item.priority in counts) counts[item.priority]++;
      }
      return counts;
    });

    const translatePriority = (priority) => {
      const key = `priority.${priority}`;
      const label = t(key);
      // t() returns the key itself when missing; fall back to the raw value
      return label === key ? priority : label;
    };

    // English needs singular forms for 1; Japanese has no plural, and its
    // "...One" keys hold the same text as the base keys.
    const shortageLabel = (item) => {
      const n = Math.abs(item.quantity_needed - item.quantity_available);
      const unit = t(
        n === 1
          ? "backlog.unitsShortOne"
          : "dashboard.inventoryShortages.unitsShort",
      );
      return `${n} ${unit}`;
    };

    const daysLabel = (days) =>
      `${days} ${t(days === 1 ? "backlog.daysOne" : "dashboard.inventoryShortages.days")}`;

    const loadBacklog = async () => {
      try {
        loading.value = true;
        error.value = null;
        allBacklogItems.value = await api.getBacklog();
      } catch (err) {
        error.value = t("backlog.error");
        console.error("Failed to load backlog:", err);
      } finally {
        loading.value = false;
      }
    };

    onMounted(loadBacklog);

    return {
      t,
      loading,
      error,
      sortedBacklog,
      priorityCounts,
      translatePriority,
      translateProductName,
      shortageLabel,
      daysLabel,
    };
  },
};
</script>

<style scoped>
.not-filtered {
  margin-top: 0.25rem;
  font-size: 0.875rem;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.success-icon {
  width: 3rem;
  height: 3rem;
  color: #10b981;
}

.empty-text {
  margin: 0;
  font-size: 1.125rem;
  color: #10b981;
  font-weight: 600;
}

.delay-high {
  color: #ef4444;
}

.delay-low {
  color: #f59e0b;
}
</style>
