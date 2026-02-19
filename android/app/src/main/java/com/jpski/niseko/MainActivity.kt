package com.jpski.niseko

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.jpski.niseko.ui.lifts.LiftsScreen
import com.jpski.niseko.ui.map.MapScreen
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.ui.trail.TrailMapScreen
import com.jpski.niseko.ui.weather.WeatherScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NisekoTheme {
                NisekoApp()
            }
        }
    }
}

enum class Tab(val label: String, val icon: String) {
    LIFTS("Lifts", "\u25C6"),
    WEATHER("Weather", "\u203B"),
    MAP("Map", "\u25B2"),
    TRAIL("Trail", "\uD83D\uDDFA"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NisekoApp(viewModel: MainViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf(Tab.LIFTS) }

    Scaffold(
        topBar = {
            NisekoTopBar(uiState.updateTime)
        },
        bottomBar = {
            NisekoBottomBar(selectedTab) { selectedTab = it }
        },
        containerColor = NisekoBg,
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (uiState.isLoading && uiState.data.isEmpty()) {
                // Loading spinner
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = NisekoPink)
                }
            } else {
                when (selectedTab) {
                    Tab.LIFTS -> {
                        val pullState = rememberPullToRefreshState()
                        if (pullState.isRefreshing) {
                            LaunchedEffect(true) {
                                viewModel.forceRefresh()
                            }
                        }
                        LaunchedEffect(uiState.isRefreshing) {
                            if (!uiState.isRefreshing) pullState.endRefresh()
                        }
                        Box(Modifier.fillMaxSize().nestedScroll(pullState.nestedScrollConnection)) {
                            LiftsScreen(uiState.data, uiState.changes)
                            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter), containerColor = NisekoCard, contentColor = NisekoPink)
                        }
                    }
                    Tab.WEATHER -> {
                        val pullState = rememberPullToRefreshState()
                        if (pullState.isRefreshing) {
                            LaunchedEffect(true) {
                                viewModel.forceRefresh()
                            }
                        }
                        LaunchedEffect(uiState.isRefreshing) {
                            if (!uiState.isRefreshing) pullState.endRefresh()
                        }
                        Box(Modifier.fillMaxSize().nestedScroll(pullState.nestedScrollConnection)) {
                            WeatherScreen(uiState.data)
                            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter), containerColor = NisekoCard, contentColor = NisekoPink)
                        }
                    }
                    Tab.MAP -> MapScreen(uiState.data)
                    Tab.TRAIL -> TrailMapScreen()
                }
            }

            // Error banner
            uiState.error?.let { error ->
                Text(
                    error,
                    color = NisekoRed,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(NisekoRed.copy(alpha = 0.15f))
                        .padding(8.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NisekoTopBar(updateTime: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NisekoBg)
            .statusBarsPadding()
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "\u26F7 Niseko United",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = NisekoPink,
        )
        Text(
            updateTime,
            fontSize = 11.sp,
            color = NisekoTextDim,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun NisekoBottomBar(selectedTab: Tab, onTabSelected: (Tab) -> Unit) {
    NavigationBar(
        containerColor = NisekoTabBg,
        contentColor = NisekoTextDim,
        tonalElevation = 0.dp,
    ) {
        Tab.entries.forEach { tab ->
            NavigationBarItem(
                selected = selectedTab == tab,
                onClick = { onTabSelected(tab) },
                icon = {
                    Text(
                        tab.icon,
                        fontSize = 20.sp,
                        color = if (selectedTab == tab) NisekoPink else NisekoTextDim,
                    )
                },
                label = {
                    Text(
                        tab.label,
                        fontSize = 10.sp,
                        color = if (selectedTab == tab) NisekoPink else NisekoTextDim,
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = NisekoCard,
                ),
            )
        }
    }
}
