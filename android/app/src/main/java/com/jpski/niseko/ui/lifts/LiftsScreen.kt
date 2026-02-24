package com.jpski.niseko.ui.lifts

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.jpski.niseko.data.*
import com.jpski.niseko.ui.theme.*
import com.jpski.niseko.util.TimeUtils
import java.time.ZoneId
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LiftsScreen(
    subResorts: List<SubResortData>,
    changes: List<ChangeEntry>,
    capabilities: Capabilities,
    timezone: String,
) {
    val tz = remember(timezone) { try { ZoneId.of(timezone) } catch (_: Exception) { ZoneId.of("Asia/Tokyo") } }
    var expandedLiftId by remember { mutableStateOf<Int?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
    ) {
        item {
            SummaryBar(subResorts)
        }

        if (changes.isNotEmpty()) {
            item {
                ChangesBanner(changes)
            }
        }

        val hasAnyWait = subResorts.any { sr -> sr.lifts?.any { it.waitMinutes != null } == true }
        for (sr in subResorts) {
            if (sr.lifts == null) {
                item(key = "resort-${sr.id}") {
                    ResortErrorCard(sr.name)
                }
            } else {
                val sortedLifts = sr.lifts.sortedBy { it.name }
                stickyHeader(key = "header-${sr.id}") {
                    ResortHeader(
                        name = sr.name,
                        openCount = sr.lifts.count { it.isRunning },
                        totalCount = sr.lifts.size,
                        agoText = TimeUtils.timeAgo(TimeUtils.latestUpdateDate(sr.lifts)),
                    )
                }
                items(sortedLifts, key = { "lift-${it.id}" }) { lift ->
                    val isChanged = changes.any {
                        it.liftName == lift.name && (System.currentTimeMillis() - it.time) < 600_000
                    }
                    LiftRow(
                        lift = lift,
                        isChanged = isChanged,
                        isExpanded = expandedLiftId == lift.id,
                        onToggle = {
                            expandedLiftId = if (expandedLiftId == lift.id) null else lift.id
                        },
                        timezone = tz,
                        hasAnyWait = hasAnyWait,
                    )
                    HorizontalDivider(color = SkiTheme.colors.cardBorder.copy(alpha = 0.5f), thickness = 0.5.dp)
                }
            }
        }

        item { Spacer(Modifier.height(400.dp)) }
    }
}

@Composable
private fun SummaryBar(subResorts: List<SubResortData>) {
    val allLifts = subResorts.flatMap { it.lifts ?: emptyList() }
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
        SummaryChip("${allLifts.size}", "Total", SkiTheme.colors.text)
    }
}

@Composable
private fun SummaryChip(count: String, label: String, color: androidx.compose.ui.graphics.Color) {
    val colors = SkiTheme.colors

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
    val colors = SkiTheme.colors

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
    val colors = SkiTheme.colors

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
    val colors = SkiTheme.colors

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
private fun waitColor(waitMinutes: Int): androidx.compose.ui.graphics.Color {
    val colors = SkiTheme.colors
    return when {
        waitMinutes <= 5 -> colors.waitLow
        waitMinutes <= 15 -> colors.waitMid
        else -> colors.waitHigh
    }
}

@Composable
private fun LiftRow(
    lift: LiftInfo,
    isChanged: Boolean,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    timezone: ZoneId,
    hasAnyWait: Boolean,
) {
    val colors = SkiTheme.colors

    // Use server-vended display data, or compute client-side as fallback
    val d = lift.display
    val renderedLeft: String
    val renderedRight: String
    val detailText: String
    val leftCls: String
    val rightCls: String

    if (d != null) {
        renderedLeft = d.left
        renderedRight = d.right
        detailText = d.detailText
        leftCls = d.leftCls
        rightCls = d.rightCls
    } else {
        // Fallback: compute client-side (matches web's computeLiftDisplay + computeRenderedColumns)
        val scheduled = lift.vailStatus == "Scheduled"
        val pastClose = TimeUtils.isPastClose(lift.endTime, timezone)
        val startMin = if (lift.startTime.isNotBlank()) TimeUtils.toMin(lift.startTime) else null
        val endMin = if (lift.endTime.isNotBlank()) TimeUtils.toMin(lift.endTime) else null
        val nowMin = TimeUtils.nowMinutes(timezone)
        val beforeOpen = startMin != null && nowMin < startMin
        val wellPastClose = endMin != null && (nowMin - endMin) > 120
        val closingSoon = lift.isRunning && endMin != null && !pastClose && (endMin - nowMin) <= 90
        val minsLeft = if (endMin != null) maxOf(0, endMin - nowMin) else null
        val showOpensAt = (beforeOpen || wellPastClose) && lift.startTime.isNotBlank()

        data class DR(val st: String, val sc: String, val wt: String, val dt: String, val col: Boolean = false)
        val r = when {
            lift.liftStatus.apiValue == "OPERATION_TEMPORARILY_SUSPENDED" -> DR("hold", "hold", "", "")
            lift.liftStatus.apiValue in listOf("SUSPENDED_CLOSED", "CLOSED") && !scheduled -> {
                val st = if (showOpensAt) "opens ${TimeUtils.fmtTime(lift.startTime)}" else "closed"
                DR(st, if (showOpensAt) "opens" else "closed", "", "")
            }
            lift.liftStatus.apiValue in listOf("SUSPENDED_CLOSED", "CLOSED") && scheduled -> {
                val pastOpen = startMin != null && nowMin >= startMin
                if (!pastClose && pastOpen) DR("delayed?", "delayed", "", "")
                else if (lift.startTime.isNotBlank()) DR("opens ${TimeUtils.fmtTime(lift.startTime)}", "opens", "", "")
                else DR("closed", "closed", "", "")
            }
            lift.isRunning -> {
                val wait = lift.waitMinutes
                val wt = when { wait == null -> ""; wait == 0 -> "0m"; else -> "${wait}m" }
                when {
                    closingSoon -> DR("closes in ${minsLeft}m", "closing-soon", "", "", col = true)
                    pastClose -> DR("open", "operating", "", if (lift.endTime.isNotBlank()) "closed at ${TimeUtils.fmtTime(lift.endTime)}" else "")
                    wait != null -> DR("", "", wt, "")
                    else -> DR("open", "operating", "", "")
                }
            }
            lift.liftStatus.apiValue == "STANDBY" -> {
                val st = if (showOpensAt) "opens ${TimeUtils.fmtTime(lift.startTime)}" else "standby"
                DR(st, if (showOpensAt) "opens" else "standby", "", "")
            }
            else -> DR("closed", "closed", "", "")
        }
        detailText = r.dt
        val stripOpens = { t: String -> if (t.startsWith("opens ")) t.substring(6) else t }
        if (r.st.isNotEmpty() && r.wt.isNotEmpty()) {
            renderedLeft = r.st; renderedRight = r.wt; leftCls = r.sc; rightCls = "wait"
        } else if (hasAnyWait && r.col) {
            renderedLeft = r.st; renderedRight = ""; leftCls = r.sc; rightCls = ""
        } else {
            val text = r.wt.ifEmpty { r.st }
            renderedLeft = ""; renderedRight = stripOpens(text); leftCls = ""; rightCls = if (r.wt.isNotEmpty()) "wait" else r.sc
        }
    }

    fun statusColor(cls: String): androidx.compose.ui.graphics.Color = when (cls) {
        "operating" -> colors.statusOpen
        "closed" -> colors.statusClosed
        "on-hold", "hold" -> colors.statusOnHold
        "opens" -> colors.statusOpens
        "closing-soon" -> colors.statusClosingSoon
        "standby" -> colors.statusStandby
        "delayed" -> colors.statusOnHold
        else -> colors.textDim
    }
    fun waitColor2(text: String): androidx.compose.ui.graphics.Color {
        val mins = text.removeSuffix("m").toIntOrNull() ?: return colors.textDim
        return when { mins <= 5 -> colors.waitLow; mins <= 15 -> colors.waitMid; else -> colors.waitHigh }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isChanged) colors.statusOnHold.copy(alpha = 0.15f) else colors.bg)
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(lift.name, color = colors.text, fontSize = 13.scaledSp, fontWeight = FontWeight.Medium)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(detailText, color = colors.textDim, fontSize = 10.scaledSp, modifier = Modifier.weight(1f))

            if (hasAnyWait) {
                Text(renderedLeft, color = statusColor(leftCls), fontSize = 10.scaledSp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End)
                Text(
                    renderedRight,
                    color = if (rightCls == "wait" || (d != null && d.rightCls.startsWith("wait"))) waitColor2(renderedRight) else statusColor(rightCls),
                    fontSize = 10.scaledSp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End, modifier = Modifier.width(36.dp),
                )
            } else {
                Text(renderedRight, color = statusColor(rightCls), fontSize = 10.scaledSp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End)
            }
        }

        AnimatedVisibility(visible = isExpanded, enter = expandVertically(), exit = shrinkVertically()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 2.dp)
                    .clip(RoundedCornerShape(6.dp)).background(colors.card).padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                DetailRow("Hours", "${TimeUtils.fmtTime(lift.startTime)} – ${TimeUtils.fmtTime(lift.endTime)}")
                lift.liftType?.let { type ->
                    DetailRow("Type", type.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() })
                }
                lift.capacity?.let { cap -> DetailRow("Capacity", "$cap seats") }
                if (lift.waitMinutes != null && lift.waitMinutes > 0) DetailRow("Wait", "${lift.waitMinutes}m wait")
                lift.comment?.let { comment -> DetailRow("Note", comment) }
                lift.updateDate?.let { updated -> DetailRow("Updated", TimeUtils.timeAgo(updated)) }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    val colors = SkiTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = colors.textDim, fontSize = 10.scaledSp)
        Text(value, color = colors.text, fontSize = 10.scaledSp)
    }
}
