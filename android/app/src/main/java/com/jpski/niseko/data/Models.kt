package com.jpski.niseko.data

// ── Resort configuration ──

enum class ResortType { NISEKO, VAIL }

data class Capabilities(
    val weather: Boolean = true,
    val trailMap: Boolean = false,
    val interactiveMap: Boolean = false,
)

data class ResortConfig(
    val id: String,
    val name: String,
    val timezone: String,
    val region: String,
    val type: ResortType,
    val capabilities: Capabilities = Capabilities(),
)

data class SubResortConfig(val id: String, val name: String)

// ── Lift data ──

data class LiftInfo(
    val id: Int,
    val name: String,
    val status: String,
    val startTime: String,  // "HH:mm"
    val endTime: String,    // "HH:mm"
    val updateDate: String? = null,
    val liftType: String? = null,
    val capacity: Int? = null,
    val waitMinutes: Int = 0,
    val comment: String? = null,
    val vailStatus: String? = null,
) {
    val liftStatus: LiftStatus get() = LiftStatus.fromApi(status)
    val isRunning: Boolean get() = liftStatus.isRunning
}

enum class LiftStatus(val apiValue: String, val label: String, val chipLabel: String = label) {
    OPERATING("OPERATING", "open", "open"),
    OPERATION_SLOWED("OPERATION_SLOWED", "slowed", "slow"),
    STANDBY("STANDBY", "standby", "standby"),
    ON_HOLD("OPERATION_TEMPORARILY_SUSPENDED", "hold", "hold"),
    CLOSED("SUSPENDED_CLOSED", "closed", "closed"),
    CLOSED2("CLOSED", "closed", "closed");

    val isRunning: Boolean get() = this == OPERATING || this == OPERATION_SLOWED

    companion object {
        fun fromApi(value: String): LiftStatus =
            entries.find { it.apiValue == value } ?: CLOSED

        fun fromVailStatus(value: String): LiftStatus = when (value) {
            "Open" -> OPERATING
            "Scheduled" -> CLOSED
            "OnHold" -> ON_HOLD
            "Closed" -> CLOSED
            else -> CLOSED
        }

        fun counts(lifts: List<LiftInfo>): Map<LiftStatus, Int> =
            lifts.groupBy { it.liftStatus }.mapValues { it.value.size }
    }
}

// ── Weather ──

data class WeatherStation(
    val name: String,
    val temperature: Double?,
    val weather: String,
    val snowAccumulation: Double?,
    val snowAccumulationDiff: Double?,
    val snowState: String,
    val windSpeed: String,
    val courseState: String,
)

// ── Fetch results ──

data class SubResortData(
    val id: String,
    val name: String,
    val lifts: List<LiftInfo>?,
    val weather: List<WeatherStation>?,
)

data class FetchResult(
    val subResorts: List<SubResortData>,
    val capabilities: Capabilities,
)

// ── Change log ──

data class ChangeEntry(
    val time: Long,
    val resortName: String,
    val liftName: String,
    val from: String,
    val to: String,
)

// ── Resort definitions ──

val NISEKO_RESORTS = listOf(
    ResortConfig("niseko", "Niseko United", "Asia/Tokyo", "Japan", ResortType.NISEKO, Capabilities(weather = true, trailMap = true, interactiveMap = true)),
)

val NISEKO_SUB_RESORTS = listOf(
    SubResortConfig("379", "Hanazono"),
    SubResortConfig("390", "Grand Hirafu"),
    SubResortConfig("393", "Annupuri"),
    SubResortConfig("394", "Niseko Village"),
)

val VAIL_RESORTS = listOf(
    // Colorado
    ResortConfig("vail", "Vail", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("beavercreek", "Beaver Creek", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("breckenridge", "Breckenridge", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("keystone", "Keystone", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("crestedbutte", "Crested Butte", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true)),
    // Utah
    ResortConfig("parkcity", "Park City Mountain", "America/Denver", "Utah", ResortType.VAIL, Capabilities(weather = true)),
    // Tahoe
    ResortConfig("heavenly", "Heavenly", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("northstar", "Northstar", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("kirkwood", "Kirkwood", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true)),
    // Pacific NW
    ResortConfig("stevenspass", "Stevens Pass", "America/Los_Angeles", "Pacific NW", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("whistlerblackcomb", "Whistler Blackcomb", "America/Vancouver", "British Columbia", ResortType.VAIL, Capabilities(weather = true)),
    // Vermont
    ResortConfig("stowe", "Stowe", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("okemo", "Okemo", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("mtsnow", "Mount Snow", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true)),
    // New Hampshire
    ResortConfig("mountsunapee", "Mount Sunapee", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("attitashmountain", "Attitash", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("wildcatmountain", "Wildcat Mountain", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("crotchedmountain", "Crotched Mountain", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true)),
    // New York
    ResortConfig("hunter", "Hunter Mountain", "America/New_York", "New York", ResortType.VAIL, Capabilities(weather = true)),
    // Mid-Atlantic
    ResortConfig("sevensprings", "Seven Springs", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("libertymountain", "Liberty Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("roundtopmountain", "Roundtop Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("whitetail", "Whitetail", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("jackfrostbigboulder", "Jack Frost / Big Boulder", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("hiddenvalleypa", "Hidden Valley PA", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("laurelmountain", "Laurel Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true)),
    // Midwest
    ResortConfig("aftonalps", "Afton Alps", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("mtbrighton", "Mt. Brighton", "America/Detroit", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("wilmotmountain", "Wilmot Mountain", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("alpinevalley", "Alpine Valley", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("bmbw", "Boston Mills / Brandywine", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("madrivermountain", "Mad River Mountain", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("hiddenvalley", "Hidden Valley MO", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("snowcreek", "Snow Creek", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
    ResortConfig("paolipeaks", "Paoli Peaks", "America/Indiana/Indianapolis", "Midwest", ResortType.VAIL, Capabilities(weather = true)),
)

val ALL_RESORTS = NISEKO_RESORTS + VAIL_RESORTS
