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
import androidx.lifecycle.ViewModelProvider
import com.jpski.niseko.data.ResortType
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
                    SkiThemeOption.entries.find { it.name == settingsRepo.themeName }
                        ?: SkiThemeOption.LIGHT
                )
            }
            var fontScale by remember { mutableFloatStateOf(settingsRepo.fontScale) }

            SkiTheme(themeOption = themeOption, fontScale = fontScale) {
                SkiApp(
                    settingsRepo = settingsRepo,
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
fun SkiApp(
    settingsRepo: SettingsRepository,
    viewModel: MainViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return MainViewModel(settingsRepo) as T
            }
        }
    ),
    themeOption: SkiThemeOption = SkiThemeOption.LIGHT,
    fontScale: Float = 1f,
    onThemeSelected: (SkiThemeOption) -> Unit = {},
    onFontScaleSelected: (Float) -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val capabilities = uiState.capabilities
    val visibleTabs = remember(capabilities) {
        Tab.entries.filter { tab ->
            when (tab) {
                Tab.MAP -> capabilities.interactiveMap
                Tab.TRAIL -> capabilities.trailMap
                else -> true
            }
        }
    }
    var selectedTab by remember { mutableStateOf(Tab.LIFTS) }
    // If selected tab is no longer visible, switch to LIFTS
    LaunchedEffect(visibleTabs) {
        if (selectedTab !in visibleTabs) {
            selectedTab = Tab.LIFTS
        }
    }
    val colors = SkiTheme.colors

    Scaffold(
        topBar = {
            SkiTopBar(
                resortName = uiState.activeResort.name,
                updateTime = uiState.updateTime,
                showYotei = uiState.activeResort.type == ResortType.NISEKO,
            )
        },
        bottomBar = {
            SkiBottomBar(visibleTabs, selectedTab) { selectedTab = it }
        },
        containerColor = colors.bg,
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (uiState.isLoading && uiState.data == null) {
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
                            LiftsScreen(
                                subResorts = uiState.data?.subResorts ?: emptyList(),
                                changes = uiState.changes,
                                capabilities = capabilities,
                                timezone = uiState.activeResort.timezone,
                            )
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
                            WeatherScreen(uiState.data?.subResorts ?: emptyList())
                            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter), containerColor = colors.card, contentColor = colors.accent)
                        }
                    }
                    Tab.MAP -> MapScreen()
                    Tab.TRAIL -> TrailMapScreen(resortId = uiState.activeResort.id)
                    Tab.SETTINGS -> SettingsScreen(
                        currentTheme = themeOption,
                        currentFontScale = fontScale,
                        onThemeSelected = onThemeSelected,
                        onFontScaleSelected = onFontScaleSelected,
                        activeResortId = uiState.activeResort.id,
                        onResortSelected = { viewModel.switchResort(it) },
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
private fun SkiTopBar(resortName: String, updateTime: String, showYotei: Boolean) {
    val colors = SkiTheme.colors

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .background(colors.bg)
            .statusBarsPadding()
            .padding(vertical = 8.dp),
    ) {
        if (showYotei) {
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
        }
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                resortName,
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
private fun SkiBottomBar(visibleTabs: List<Tab>, selectedTab: Tab, onTabSelected: (Tab) -> Unit) {
    val colors = SkiTheme.colors

    NavigationBar(
        containerColor = colors.tabBg,
        contentColor = colors.textDim,
        tonalElevation = 0.dp,
    ) {
        visibleTabs.forEach { tab ->
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
