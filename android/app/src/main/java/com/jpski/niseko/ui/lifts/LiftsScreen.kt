package com.jpski.niseko.ui.lifts

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.jpski.niseko.data.*
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.util.TimeUtils

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LiftsScreen(
    data: Map<String, ResortData>,
    changes: List<ChangeEntry>,
) {
    val resorts = Resort.ALL

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
    ) {
        item {
            SummaryBar(data, resorts)
        }

        if (changes.isNotEmpty()) {
            item {
                ChangesBanner(changes)
            }
        }

        for (resort in resorts) {
            val rd = data[resort.id]
            if (rd == null || rd.lifts == null) {
                item(key = "resort-${resort.id}") {
                    ResortErrorCard(resort.name)
                }
            } else {
                val sortedLifts = rd.lifts.sortedBy { it.name }
                stickyHeader(key = "header-${resort.id}") {
                    ResortHeader(
                        name = resort.name,
                        openCount = rd.lifts.count { it.isRunning },
                        totalCount = rd.lifts.size,
                        agoText = TimeUtils.timeAgo(TimeUtils.latestUpdateDate(rd.lifts)),
                    )
                }
                items(sortedLifts, key = { "lift-${it.id}" }) { lift ->
                    val isChanged = changes.any {
                        it.liftName == lift.name && (System.currentTimeMillis() - it.time) < 600_000
                    }
                    LiftRow(lift, isChanged)
                    HorizontalDivider(color = NisekoTheme.colors.cardBorder.copy(alpha = 0.5f), thickness = 0.5.dp)
                }
            }
        }

        item { Spacer(Modifier.height(400.dp)) }
    }
}

@Composable
private fun SummaryBar(data: Map<String, ResortData>, resorts: List<Resort>) {
    val allLifts = resorts.flatMap { data[it.id]?.lifts ?: emptyList() }
    val counts = LiftStatus.counts(allLifts)
    val chips = listOf(
        LiftStatus.OPERATING to true,
        LiftStatus.OPERATION_SLOWED to (counts.getOrDefault(LiftStatus.OPERATION_SLOWED, 0) > 0),
        LiftStatus.STANDBY to (counts.getOrDefault(LiftStatus.STANDBY, 0) > 0),
        LiftStatus.ON_HOLD to true,
        LiftStatus.CLOSED to (counts.getOrDefault(LiftStatus.CLOSED, 0) + counts.getOrDefault(LiftStatus.CLOSED2, 0) > 0),
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
    ) {
        for ((status, show) in chips) {
            if (show) {
                val count = if (status == LiftStatus.CLOSED) {
                    counts.getOrDefault(LiftStatus.CLOSED, 0) + counts.getOrDefault(LiftStatus.CLOSED2, 0)
                } else counts.getOrDefault(status, 0)
                SummaryChip("$count", status.chipLabel, status.color)
            }
        }
        SummaryChip("${allLifts.size}", "Total", NisekoTheme.colors.text)
    }
}

@Composable
private fun SummaryChip(count: String, label: String, color: androidx.compose.ui.graphics.Color) {
    val colors = NisekoTheme.colors

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(colors.card)
            .padding(horizontal = 6.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(count, color = color, fontSize = 13.scaledSp, fontWeight = FontWeight.Bold)
        Text(label, color = colors.textDim, fontSize = 10.scaledSp)
    }
}

@Composable
private fun ChangesBanner(changes: List<ChangeEntry>) {
    val colors = NisekoTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.accent.copy(alpha = 0.12f))
            .padding(8.dp),
    ) {
        Text(
            "Recent Changes (last 10 min)",
            color = colors.statusOnHold,
            fontSize = 11.scaledSp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(2.dp))
        changes.reversed().forEach { c ->
            val ago = ((System.currentTimeMillis() - c.time) / 60_000).toInt()
            val timeStr = if (ago < 1) "just now" else "${ago}m ago"
            Text(
                "$timeStr  ${c.resortName} – ${c.liftName}: ${c.from} → ${c.to}",
                color = colors.statusSlowed,
                fontSize = 10.scaledSp,
            )
        }
    }
}

@Composable
private fun ResortHeader(name: String, openCount: Int, totalCount: Int, agoText: String = "") {
    val colors = NisekoTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.card)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(name, color = colors.accent, fontSize = 15.scaledSp, fontWeight = FontWeight.SemiBold)
            if (agoText.isNotEmpty()) {
                Text(agoText, color = colors.textDim, fontSize = 9.scaledSp)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("$openCount", color = colors.statusOpen, fontSize = 11.scaledSp, fontWeight = FontWeight.SemiBold)
            Text(" / $totalCount", color = colors.textDim, fontSize = 11.scaledSp)
        }
    }
}

@Composable
private fun ResortErrorCard(name: String) {
    val colors = NisekoTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.card)
            .padding(12.dp),
    ) {
        Text(name, color = colors.accent, fontSize = 15.scaledSp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text("Error", color = colors.error, fontSize = 11.scaledSp)
    }
}

@Composable
private fun LiftRow(lift: LiftInfo, isChanged: Boolean) {
    val colors = NisekoTheme.colors

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isChanged) colors.statusOnHold.copy(alpha = 0.15f) else colors.bg)
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(lift.name, color = colors.text, fontSize = 13.scaledSp, fontWeight = FontWeight.Medium)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                TimeUtils.liftTimeLabel(lift.startTime, lift.endTime),
                color = colors.textDim,
                fontSize = 10.scaledSp,
            )
            Text(
                lift.liftStatus.label.uppercase(),
                color = lift.liftStatus.color,
                fontSize = 10.scaledSp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.End,
            )
        }
    }
}
