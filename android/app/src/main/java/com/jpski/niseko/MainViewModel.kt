package com.jpski.niseko

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jpski.niseko.data.ChangeEntry
import com.jpski.niseko.data.NisekoRepository
import com.jpski.niseko.data.ResortData
import com.jpski.niseko.util.TimeUtils
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
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

class MainViewModel(
    private val repository: NisekoRepository = NisekoRepository(),
) : ViewModel() {
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
            // viewModelScope is cancelled when the ViewModel is cleared,
            // ensuring this loop stops when the user navigates away.
            while (true) {
                ensureActive()
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
}
