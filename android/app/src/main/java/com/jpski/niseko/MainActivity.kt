package com.jpski.niseko

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.jpski.niseko.data.SettingsRepository
import com.jpski.niseko.ui.lifts.LiftsScreen
import com.jpski.niseko.ui.map.MapScreen
import com.jpski.niseko.ui.settings.SettingsScreen
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.ui.trail.TrailMapScreen
import com.jpski.niseko.ui.weather.WeatherScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settingsRepo = SettingsRepository(this)
        enableEdgeToEdge()
        setContent {
            var themeOption by remember {
                mutableStateOf(
                    NisekoThemeOption.entries.find { it.name == settingsRepo.themeName }
                        ?: NisekoThemeOption.LIGHT
                )
            }
            var fontScale by remember { mutableFloatStateOf(settingsRepo.fontScale) }

            NisekoTheme(themeOption = themeOption, fontScale = fontScale) {
                NisekoApp(
                    themeOption = themeOption,
                    fontScale = fontScale,
                    onThemeSelected = {
                        themeOption = it
                        settingsRepo.themeName = it.name
                    },
                    onFontScaleSelected = {
                        fontScale = it
                        settingsRepo.fontScale = it
                    },
                )
            }
        }
    }
}

enum class Tab(val label: String, val icon: String) {
    LIFTS("Lifts", "\u25C6"),
    WEATHER("Weather", "\u203B"),
    MAP("Map", "\u25B2"),
    TRAIL("Trail", "\uD83D\uDDFA"),
    SETTINGS("Settings", "\u2699"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NisekoApp(
    viewModel: MainViewModel = viewModel(),
    themeOption: NisekoThemeOption = NisekoThemeOption.LIGHT,
    fontScale: Float = 1f,
    onThemeSelected: (NisekoThemeOption) -> Unit = {},
    onFontScaleSelected: (Float) -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf(Tab.LIFTS) }
    val colors = NisekoTheme.colors

    Scaffold(
        topBar = {
            NisekoTopBar(uiState.updateTime)
        },
        bottomBar = {
            NisekoBottomBar(selectedTab) { selectedTab = it }
        },
        containerColor = colors.bg,
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (uiState.isLoading && uiState.data.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.accent)
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
                            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter), containerColor = colors.card, contentColor = colors.accent)
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
                            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter), containerColor = colors.card, contentColor = colors.accent)
                        }
                    }
                    Tab.MAP -> MapScreen(uiState.data)
                    Tab.TRAIL -> TrailMapScreen()
                    Tab.SETTINGS -> SettingsScreen(
                        currentTheme = themeOption,
                        currentFontScale = fontScale,
                        onThemeSelected = onThemeSelected,
                        onFontScaleSelected = onFontScaleSelected,
                    )
                }
            }

            uiState.error?.let { error ->
                Text(
                    error,
                    color = colors.error,
                    fontSize = 13.scaledSp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colors.error.copy(alpha = 0.15f))
                        .padding(8.dp),
                )
            }
        }
    }
}

@Composable
private fun NisekoTopBar(updateTime: String) {
    val colors = NisekoTheme.colors

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .background(colors.bg)
            .statusBarsPadding()
            .padding(vertical = 8.dp),
    ) {
        Image(
            painter = painterResource(R.drawable.yotei),
            contentDescription = null,
            contentScale = ContentScale.FillHeight,
            colorFilter = ColorFilter.tint(colors.accent.copy(alpha = 0.4f)),
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .padding(start = 4.dp),
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Niseko United",
                fontSize = 20.scaledSp,
                fontWeight = FontWeight.Bold,
                color = colors.accent,
            )
            Text(
                updateTime,
                fontSize = 11.scaledSp,
                color = colors.textDim,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun NisekoBottomBar(selectedTab: Tab, onTabSelected: (Tab) -> Unit) {
    val colors = NisekoTheme.colors

    NavigationBar(
        containerColor = colors.tabBg,
        contentColor = colors.textDim,
        tonalElevation = 0.dp,
    ) {
        Tab.entries.forEach { tab ->
            NavigationBarItem(
                selected = selectedTab == tab,
                onClick = { onTabSelected(tab) },
                icon = {
                    Text(
                        tab.icon,
                        fontSize = 20.scaledSp,
                        color = if (selectedTab == tab) colors.accent else colors.textDim,
                    )
                },
                label = {
                    Text(
                        tab.label,
                        fontSize = 10.scaledSp,
                        color = if (selectedTab == tab) colors.accent else colors.textDim,
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = colors.card,
                ),
            )
        }
    }
}
