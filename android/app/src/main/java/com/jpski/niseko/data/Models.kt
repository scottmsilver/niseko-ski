package com.jpski.niseko.data

data class Resort(val id: String, val name: String) {
    companion object {
        val ALL = listOf(
            Resort("379", "Hanazono"),
            Resort("390", "Grand Hirafu"),
            Resort("393", "Annupuri"),
            Resort("394", "Niseko Village"),
        )
    }
}

data class LiftInfo(
    val id: Int,
    val name: String,
    val status: String,
    val startTime: String,  // "HH:mm"
    val endTime: String,    // "HH:mm"
    val updateDate: String? = null, // ISO timestamp from API
) {
    val liftStatus: LiftStatus get() = LiftStatus.fromApi(status)
    val isRunning: Boolean get() = liftStatus.isRunning
}

enum class LiftStatus(val apiValue: String, val label: String, val chipLabel: String = label) {
    OPERATING("OPERATING", "Open", "Open"),
    OPERATION_SLOWED("OPERATION_SLOWED", "Slowed", "Slow"),
    STANDBY("STANDBY", "Standby", "Standby"),
    ON_HOLD("OPERATION_TEMPORARILY_SUSPENDED", "On Hold", "On Hold"),
    CLOSED("SUSPENDED_CLOSED", "Closed", "Closed"),
    CLOSED2("CLOSED", "Closed", "Closed");

    val isRunning: Boolean get() = this == OPERATING || this == OPERATION_SLOWED

    companion object {
        fun fromApi(value: String): LiftStatus =
            entries.find { it.apiValue == value } ?: CLOSED

        fun counts(lifts: List<LiftInfo>): Map<LiftStatus, Int> =
            lifts.groupBy { it.liftStatus }.mapValues { it.value.size }
    }
}

data class WeatherStation(
    val name: String,
    val temperature: Double,
    val weather: String,
    val snowAccumulation: Double,
    val snowAccumulationDiff: Double?,
    val snowState: String,
    val windSpeed: String,
    val courseState: String,
)

data class ResortData(
    val resort: Resort,
    val lifts: List<LiftInfo>?,
    val weather: List<WeatherStation>?,
)

data class ChangeEntry(
    val time: Long,
    val resortName: String,
    val liftName: String,
    val from: String,
    val to: String,
)
