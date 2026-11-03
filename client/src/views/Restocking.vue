<template>
  <div class="restocking">
    <div class="page-header">
      <h2>{{ t('restocking.title') }}</h2>
      <p>{{ t('restocking.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="card budget-card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.budgetTitle') }}</h3>
          <span class="budget-amount">{{ formatCurrency(budget) }}</span>
        </div>
        <input
          v-model.number="budget"
          type="range"
          min="0"
          max="500000"
          step="5000"
          class="budget-slider"
          :aria-label="t('restocking.budgetLabel')"
        />
        <div class="slider-scale">
          <span>{{ formatCurrency(0) }}</span>
          <span>{{ formatCurrency(500000) }}</span>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">{{ t('restocking.stats.budget') }}</div>
          <div class="stat-value">{{ formatCurrency(budget) }}</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">{{ t('restocking.stats.plannedSpend') }}</div>
          <div class="stat-value">{{ formatCurrency(plannedSpend) }}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">{{ t('restocking.stats.remaining') }}</div>
          <div class="stat-value">{{ formatCurrency(remainingBudget) }}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">{{ t('restocking.stats.longestLeadTime') }}</div>
          <div class="stat-value">{{ longestLeadTime }} {{ t('restocking.days') }}</div>
        </div>
      </div>

      <div v-if="orderResult" class="success-banner" role="status">
        <strong>{{ t('restocking.success.title') }}.</strong>
        {{ t('restocking.success.message', {
          orderNumber: orderResult.order_number,
          total: formatCurrency(orderResult.total_value),
          days: orderResult.lead_time_days
        }) }}
        <router-link to="/orders">{{ t('restocking.success.viewOrders') }}</router-link>
      </div>
      <div v-if="submitError" class="error submit-error" role="alert">{{ submitError }}</div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('restocking.recommendations') }} ({{ recommendations.length }})</h3>
          <button
            type="button"
            class="place-order-btn"
            :disabled="recommendations.length === 0 || submitting"
            @click="placeOrder"
          >
            {{ submitting ? t('restocking.submitting') : t('restocking.placeOrder') }}
          </button>
        </div>

        <div v-if="recommendations.length === 0" class="empty-state">{{ t('restocking.empty') }}</div>
        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>{{ t('restocking.table.sku') }}</th>
                <th>{{ t('restocking.table.itemName') }}</th>
                <th>{{ t('restocking.table.trend') }}</th>
                <th>{{ t('restocking.table.gap') }}</th>
                <th>{{ t('restocking.table.quantity') }}</th>
                <th>{{ t('restocking.table.unitCost') }}</th>
                <th>{{ t('restocking.table.lineTotal') }}</th>
                <th>{{ t('restocking.table.leadTime') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rec in recommendations" :key="rec.item_sku">
                <td><strong>{{ rec.item_sku }}</strong></td>
                <td>{{ rec.item_name }}</td>
                <td>
                  <span :class="['badge', rec.trend]">{{ t(`trends.${rec.trend}`) }}</span>
                </td>
                <td>{{ rec.gap }}</td>
                <td>
                  <strong>{{ rec.quantity }}</strong>
                  <span v-if="rec.quantity < rec.gap" class="partial-note">
                    {{ t('restocking.ofNeeded', { count: rec.gap }) }}
                  </span>
                </td>
                <td>{{ formatCurrency(rec.unit_cost) }}</td>
                <td><strong>{{ formatCurrency(rec.lineTotal) }}</strong></td>
                <td>{{ rec.lead_time_days }} {{ t('restocking.days') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useI18n } from '../composables/useI18n'

export default {
  name: 'Restocking',
  setup() {
    const { t, currentCurrency } = useI18n()

    const currencySymbol = computed(() => {
      return currentCurrency.value === 'JPY' ? '¥' : '$'
    })

    const loading = ref(true)
    const error = ref(null)
    const forecasts = ref([])
    const budget = ref(100000)

    const submitting = ref(false)
    const submitError = ref(null)
    const orderResult = ref(null)

    const formatCurrency = (value) => `${currencySymbol.value}${Number(value).toLocaleString()}`

    // Greedy budget allocation.
    // Candidates: items whose forecast exceeds current demand (gap > 0).
    // Priority: 'increasing' trend first, then larger gap first.
    // For each item buy min(gap, what the remaining budget affords). Items that
    // cannot afford even one unit are skipped (a cheaper later item may still fit),
    // so the last funded item may be only partially funded (quantity < gap).
    const recommendations = computed(() => {
      const candidates = forecasts.value
        .map(f => ({ ...f, gap: f.forecasted_demand - f.current_demand }))
        .filter(f => f.gap > 0)
        .sort((a, b) => {
          const aInc = a.trend === 'increasing' ? 0 : 1
          const bInc = b.trend === 'increasing' ? 0 : 1
          if (aInc !== bInc) return aInc - bInc
          return b.gap - a.gap
        })

      let remaining = budget.value
      const result = []
      for (const item of candidates) {
        if (!(item.unit_cost > 0)) continue // guard against division by zero
        const quantity = Math.min(item.gap, Math.floor(remaining / item.unit_cost))
        if (quantity <= 0) continue
        const lineTotal = quantity * item.unit_cost
        remaining -= lineTotal
        result.push({ ...item, quantity, lineTotal })
      }
      return result
    })

    const plannedSpend = computed(() =>
      recommendations.value.reduce((sum, r) => sum + r.lineTotal, 0)
    )

    const remainingBudget = computed(() => budget.value - plannedSpend.value)

    const longestLeadTime = computed(() =>
      recommendations.value.reduce((max, r) => Math.max(max, r.lead_time_days), 0)
    )

    const loadForecasts = async () => {
      try {
        loading.value = true
        error.value = null
        forecasts.value = await api.getDemandForecasts()
      } catch (err) {
        error.value = 'Failed to load demand forecasts: ' + err.message
        console.error('Load error:', err)
      } finally {
        loading.value = false
      }
    }

    const placeOrder = async () => {
      if (recommendations.value.length === 0 || submitting.value) return
      try {
        submitting.value = true
        submitError.value = null
        orderResult.value = null
        orderResult.value = await api.createRestockingOrder({
          budget: budget.value,
          items: recommendations.value.map(r => ({
            item_sku: r.item_sku,
            quantity: r.quantity
          }))
        })
      } catch (err) {
        submitError.value = err.response?.data?.detail || t('restocking.submitFailed')
        console.error('Failed to place restocking order:', err)
      } finally {
        submitting.value = false
      }
    }

    onMounted(loadForecasts)

    return {
      t,
      loading,
      error,
      budget,
      recommendations,
      plannedSpend,
      remainingBudget,
      longestLeadTime,
      submitting,
      submitError,
      orderResult,
      formatCurrency,
      placeOrder
    }
  }
}
</script>

<style scoped>
.budget-card {
  margin-bottom: 1.5rem;
}

.budget-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
}

.budget-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e2e8f0;
  outline: none;
  cursor: pointer;
}

.budget-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #0f172a;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.4);
}

.budget-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #0f172a;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.4);
}

.budget-slider:focus-visible {
  outline: 2px solid #64748b;
  outline-offset: 4px;
}

.slider-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.813rem;
  color: #64748b;
}

.place-order-btn {
  background: #0f172a;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.place-order-btn:hover:not(:disabled) {
  background: #1e293b;
}

.place-order-btn:disabled {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
}

.success-banner {
  background: #d1fae5;
  border: 1px solid #10b981;
  color: #065f46;
  border-radius: 8px;
  padding: 0.875rem 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.938rem;
}

.success-banner a {
  color: #047857;
  font-weight: 600;
  margin-left: 0.25rem;
}

.submit-error {
  margin-bottom: 1.5rem;
}

.partial-note {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #64748b;
}
</style>
