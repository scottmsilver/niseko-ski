package com.jpski.niseko.util

import com.jpski.niseko.data.LiftInfo
import java.time.ZoneId
import java.time.ZonedDateTime

object TimeUtils {
    private const val CLOSING_SOON_MIN = 90

    fun fmtTime(timeStr: String): String {
        val parts = timeStr.split(":")
        val h = parts[0].toIntOrNull() ?: return timeStr
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val hr = if (h % 12 == 0) 12 else h % 12
        val suffix = if (h < 12) "a" else "p"
        return if (m == 0) "$hr$suffix" else "$hr:${m.toString().padStart(2, '0')}$suffix"
    }

    fun liftTimeLabel(startTime: String, endTime: String, timezone: ZoneId, status: String): String {
        if (!isRunning(status)) return ""
        if (startTime.isBlank() || endTime.isBlank()) return ""

        val nowMin = ZonedDateTime.now(timezone).let { it.hour * 60 + it.minute }
        val startMin = parseMinutes(startTime)
        val endMin = parseMinutes(endTime)

        if (nowMin < startMin) return "opens ${fmtTime(startTime)}"
        if (endMin - nowMin <= CLOSING_SOON_MIN && endMin > nowMin) {
            return "${fmtTime(startTime)} – ${fmtTime(endTime)}"
        }
        return ""
    }

    fun isClosingSoon(startTime: String, endTime: String, timezone: ZoneId): Boolean {
        if (startTime.isBlank() || endTime.isBlank()) return false
        val nowMin = nowMinutes(timezone)
        val endMin = parseMinutes(endTime)
        return endMin - nowMin <= CLOSING_SOON_MIN && endMin > nowMin
    }

    fun isPastClose(endTime: String, timezone: ZoneId): Boolean {
        if (endTime.isBlank()) return false
        return nowMinutes(timezone) >= parseMinutes(endTime)
    }

    fun currentTimeFormatted(timezone: ZoneId): String {
        val now = ZonedDateTime.now(timezone)
        return "Updated ${fmtTime("${now.hour}:${now.minute}")}"
    }

    fun parseMinutes(timeStr: String): Int {
        val parts = timeStr.split(":")
        return (parts[0].toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
    }

    fun toMin(timeStr: String): Int = parseMinutes(timeStr)

    fun nowMinutes(timezone: ZoneId): Int =
        ZonedDateTime.now(timezone).let { it.hour * 60 + it.minute }

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

    private fun isRunning(status: String): Boolean =
        status == "OPERATING" || status == "OPERATION_SLOWED"
}
