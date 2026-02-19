package com.jpski.niseko.util

import com.jpski.niseko.data.LiftInfo
import java.time.ZoneId
import java.time.ZonedDateTime

object TimeUtils {
    private val JST = ZoneId.of("Asia/Tokyo")

    fun fmtTime(timeStr: String): String {
        val parts = timeStr.split(":")
        val h = parts[0].toIntOrNull() ?: return timeStr
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val hr = if (h % 12 == 0) 12 else h % 12
        val suffix = if (h < 12) "a" else "p"
        return if (m == 0) "$hr$suffix" else "$hr:${m.toString().padStart(2, '0')}$suffix"
    }

    fun liftTimeLabel(startTime: String, endTime: String): String {
        val nowMin = ZonedDateTime.now(JST).let { it.hour * 60 + it.minute }
        return if (nowMin in parseMinutes(startTime) until parseMinutes(endTime)) {
            "til ${fmtTime(endTime)}"
        } else {
            "${fmtTime(startTime)} – ${fmtTime(endTime)}"
        }
    }

    fun currentTimeFormatted(): String {
        val now = ZonedDateTime.now(JST)
        return "Updated ${fmtTime("${now.hour}:${now.minute}")}"
    }

    fun parseMinutes(timeStr: String): Int {
        val parts = timeStr.split(":")
        return (parts[0].toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
    }

    fun cToF(c: Double): Int = Math.round(c * 9.0 / 5.0 + 32.0).toInt()
    fun cmToIn(cm: Double): Int = Math.round(cm / 2.54).toInt()

    fun timeAgo(isoString: String?): String {
        if (isoString.isNullOrBlank()) return ""
        return try {
            val then = java.time.Instant.parse(isoString).toEpochMilli()
            val mins = (System.currentTimeMillis() - then) / 60_000
            when {
                mins < 1 -> "just now"
                mins < 60 -> "${mins}m ago"
                mins < 1440 -> "${mins / 60}h ago"
                else -> "${mins / 1440}d ago"
            }
        } catch (_: Exception) { "" }
    }

    fun latestUpdateDate(lifts: List<LiftInfo>): String? =
        lifts.mapNotNull { it.updateDate?.takeIf { d -> d.isNotBlank() } }.maxOrNull()
}
