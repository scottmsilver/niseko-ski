package com.jpski.niseko

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jpski.niseko.data.ALL_RESORTS
import com.jpski.niseko.data.Capabilities
import com.jpski.niseko.data.ChangeEntry
import com.jpski.niseko.data.FetchResult
import com.jpski.niseko.data.NISEKO_RESORTS
import com.jpski.niseko.data.ResortConfig
import com.jpski.niseko.data.SettingsRepository
import com.jpski.niseko.data.SkiRepository
import com.jpski.niseko.util.TimeUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.ZoneId

data class SkiUiState(
    val data: FetchResult? = null,
    val activeResort: ResortConfig = NISEKO_RESORTS.first(),
    val capabilities: Capabilities = NISEKO_RESORTS.first().capabilities,
    val changes: List<ChangeEntry> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val updateTime: String = "Loading...",
)

class MainViewModel(
    private val settingsRepo: SettingsRepository,
    private val repository: SkiRepository = SkiRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(SkiUiState())
    val uiState: StateFlow<SkiUiState> = _uiState.asStateFlow()

    private var refreshJob: Job? = null

    companion object {
        private const val REFRESH_INTERVAL_MS = 120_000L
    }

    init {
        val savedId = settingsRepo.activeResortId
        val resort = ALL_RESORTS.find { it.id == savedId } ?: NISEKO_RESORTS.first()
        repository.switchResort(resort)
        _uiState.value = SkiUiState(activeResort = resort, capabilities = resort.capabilities)
        startRefreshLoop()
    }

    private fun startRefreshLoop() {
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            while (true) {
                ensureActive()
                refresh()
                delay(REFRESH_INTERVAL_MS)
            }
        }
    }

    private suspend fun refresh() {
        val resort = repository.activeResort
        try {
            val data = repository.fetchData()
            _uiState.value = SkiUiState(
                data = data,
                activeResort = resort,
                capabilities = data.capabilities,
                changes = repository.changeLog.toList(),
                isLoading = false,
                error = null,
                updateTime = TimeUtils.currentTimeFormatted(ZoneId.of(resort.timezone)),
            )
        } catch (e: Exception) {
            Log.e("MainViewModel", "Refresh failed", e)
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                error = "Unable to load resort data. Please check your connection.",
                updateTime = "Update failed",
            )
        }
    }

    fun forceRefresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            refresh()
            _uiState.value = _uiState.value.copy(isRefreshing = false)
        }
    }

    fun switchResort(id: String) {
        val resort = ALL_RESORTS.find { it.id == id } ?: return
        repository.switchResort(resort)
        settingsRepo.activeResortId = id
        _uiState.value = SkiUiState(activeResort = resort, capabilities = resort.capabilities)
        startRefreshLoop()
    }
}
