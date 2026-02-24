package com.jpski.niseko.ui.weather

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jpski.niseko.data.*
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.util.TimeUtils

private val SUMMIT_REGEX = Regex("top|peak|summit", RegexOption.IGNORE_CASE)
private val BASE_REGEX = Regex("base|foot", RegexOption.IGNORE_CASE)

@Composable
fun WeatherScreen(subResorts: List<SubResortData>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(
            count = subResorts.size,
            key = { i -> "wx-${subResorts[i].id}" },
        ) { i ->
            val sr = subResorts[i]
            if (!sr.stations.isNullOrEmpty()) {
                ServerWeatherCard(sr.name, sr.stations)
            } else {
                WeatherCard(sr.name, sr.weather)
            }
        }
        item(key = "wx-spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun ServerWeatherCard(name: String, stations: List<WeatherStationDisplay>) {
    val colors = SkiTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.card)
            .padding(14.dp),
    ) {
        Text(
            name,
            color = colors.accent,
            fontSize = 15.scaledSp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 10.dp),
        )

        if (stations.size == 1) {
            ServerStationColumn(stations[0], Modifier.fillMaxWidth())
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                for (station in stations) {
                    ServerStationColumn(station, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ServerStationColumn(station: WeatherStationDisplay, modifier: Modifier = Modifier) {
    val colors = SkiTheme.colors

    Column(modifier = modifier) {
        Text(
            station.label.uppercase(),
            color = colors.accentSecondary,
            fontSize = 11.scaledSp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        Text(
            station.tempF,
            color = colors.accentTertiary,
            fontSize = 26.scaledSp,
            fontWeight = FontWeight.Bold,
        )

        Text(
            "${station.icon} ${station.weather}",
            color = colors.textDim,
            fontSize = 13.scaledSp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        WxRow("Snow", station.snowDisplay)
        WxRow("24h New", station.snow24hDisplay)
        WxRow("Condition", station.snowState)
        WxRow("Wind", station.wind)
        WxRow("Courses", station.courses)
    }
}

@Composable
private fun WeatherCard(name: String, stations: List<WeatherStation>?) {
    val colors = SkiTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(colors.card)
            .padding(14.dp),
    ) {
        Text(
            name,
            color = colors.accent,
            fontSize = 15.scaledSp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 10.dp),
        )

        if (stations.isNullOrEmpty()) {
            Text("No data", color = colors.textDim, fontSize = 13.scaledSp)
        } else if (stations.size == 1) {
            // Single station (e.g., Vail resorts) - show single "Conditions" column
            StationColumn("CONDITIONS", stations[0], Modifier.fillMaxWidth())
        } else {
            // Dual station (e.g., Niseko) - Summit / Base layout
            val summit = stations.find { it.name.contains(SUMMIT_REGEX) }
                ?: stations.first()
            val base = stations.find { it.name.contains(BASE_REGEX) }
                ?: stations.last()

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StationColumn("SUMMIT", summit, Modifier.weight(1f))
                StationColumn("BASE", base, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun StationColumn(label: String, station: WeatherStation, modifier: Modifier = Modifier) {
    val colors = SkiTheme.colors

    Column(modifier = modifier) {
        Text(
            label,
            color = colors.accentSecondary,
            fontSize = 11.scaledSp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        station.temperature?.let { temp ->
            Text(
                "${TimeUtils.cToF(temp)}°F",
                color = colors.accentTertiary,
                fontSize = 26.scaledSp,
                fontWeight = FontWeight.Bold,
            )
        }

        Text(
            "${wxIcon(station.weather)} ${station.weather}",
            color = colors.textDim,
            fontSize = 13.scaledSp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        station.snowAccumulation?.let { snow ->
            WxRow("Snow", "${TimeUtils.cmToIn(snow)}\" (${snow.toInt()}cm)")
        }
        station.snowAccumulationDiff?.let { diff ->
            WxRow("24h New", "${TimeUtils.cmToIn(diff)}\" (${diff.toInt()}cm)")
        }
        WxRow("Condition", station.snowState)
        WxRow("Wind", station.windSpeed)
        WxRow("Courses", station.courseState)
    }
}

@Composable
private fun WxRow(label: String, value: String) {
    val colors = SkiTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = colors.textDim, fontSize = 13.scaledSp)
        Text(value, color = colors.text, fontSize = 13.scaledSp, textAlign = TextAlign.End)
    }
}

private fun wxIcon(weather: String): String {
    val w = weather.lowercase()
    return when {
        "storm" in w || "blizzard" in w -> "\uD83C\uDF2C\uFE0F"
        "snow" in w -> "\u2744\uFE0F"
        "rain" in w -> "\uD83C\uDF27\uFE0F"
        "cloud" in w || "overcast" in w -> "\u2601\uFE0F"
        "sun" in w || "clear" in w || "fine" in w -> "\u2600\uFE0F"
        "fog" in w || "mist" in w -> "\uD83C\uDF2B\uFE0F"
        else -> "\uD83C\uDF24\uFE0F"
    }
}
