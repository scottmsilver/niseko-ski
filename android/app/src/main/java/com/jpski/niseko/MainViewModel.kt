package com.jpski.niseko

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jpski.niseko.data.ChangeEntry
import com.jpski.niseko.data.NisekoRepository
import com.jpski.niseko.data.ResortData
import com.jpski.niseko.util.TimeUtils
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class NisekoUiState(
    val data: Map<String, ResortData> = emptyMap(),
    val changes: List<ChangeEntry> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val updateTime: String = "Loading...",
)

class MainViewModel : ViewModel() {
    private val repository = NisekoRepository()
    private val _uiState = MutableStateFlow(NisekoUiState())
    val uiState: StateFlow<NisekoUiState> = _uiState.asStateFlow()

    companion object {
        private const val REFRESH_INTERVAL_MS = 120_000L
    }

    init {
        startRefreshLoop()
    }

    private fun startRefreshLoop() {
        viewModelScope.launch {
            while (true) {
                refresh()
                delay(REFRESH_INTERVAL_MS)
            }
        }
    }

    private suspend fun refresh() {
        try {
            val data = repository.fetchData()
            _uiState.value = NisekoUiState(
                data = data,
                changes = repository.changeLog.toList(),
                isLoading = false,
                error = null,
                updateTime = TimeUtils.currentTimeFormatted(),
            )
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                error = "Failed: ${e.message}",
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
}
