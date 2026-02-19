package com.jpski.niseko.ui.weather

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jpski.niseko.data.*
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.util.TimeUtils

@Composable
fun WeatherScreen(data: Map<String, ResortData>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        for (resort in Resort.ALL) {
            item(key = "wx-${resort.id}") {
                WeatherCard(resort, data[resort.id]?.weather)
            }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun WeatherCard(resort: Resort, stations: List<WeatherStation>?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(NisekoCard)
            .padding(14.dp),
    ) {
        Text(
            resort.name,
            color = NisekoPink,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 10.dp),
        )

        if (stations.isNullOrEmpty()) {
            Text("No data", color = NisekoTextDim, fontSize = 13.sp)
            return@Column
        }

        val summit = stations.find { it.name.contains(Regex("top|peak|summit", RegexOption.IGNORE_CASE)) }
            ?: stations.first()
        val base = stations.find { it.name.contains(Regex("base|foot", RegexOption.IGNORE_CASE)) }
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

@Composable
private fun StationColumn(label: String, station: WeatherStation, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            label,
            color = NisekoPurple,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        Text(
            "${TimeUtils.cToF(station.temperature)}°F",
            color = NisekoTeal,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
        )

        Text(
            "${wxIcon(station.weather)} ${station.weather}",
            color = NisekoTextDim,
            fontSize = 13.sp,
            modifier = Modifier.padding(bottom = 6.dp),
        )

        WxRow("Snow", "${TimeUtils.cmToIn(station.snowAccumulation)}\" (${station.snowAccumulation.toInt()}cm)")
        WxRow("24h New", station.snowAccumulationDiff?.let {
            "${TimeUtils.cmToIn(it)}\" (${it.toInt()}cm)"
        } ?: "—")
        WxRow("Condition", station.snowState)
        WxRow("Wind", station.windSpeed)
        WxRow("Courses", station.courseState)
    }
}

@Composable
private fun WxRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = NisekoTextDim, fontSize = 13.sp)
        Text(value, color = NisekoText, fontSize = 13.sp, textAlign = TextAlign.End)
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
