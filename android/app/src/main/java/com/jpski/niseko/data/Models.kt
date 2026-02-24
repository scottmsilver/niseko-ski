package com.jpski.niseko.data

// ── Resort configuration ──

enum class ResortType { NISEKO, VAIL, ALTA, SNOWBIRD }

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

// ── Lift display (server-vended) ──

data class LiftDisplay(
    val detailText: String = "",
    val left: String = "",
    val leftCls: String = "",
    val right: String = "",
    val rightCls: String = "",
)

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
    val waitMinutes: Int? = null,
    val comment: String? = null,
    val vailStatus: String? = null,
    val display: LiftDisplay? = null,
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

// ── Weather display (server-vended, pre-formatted) ──

data class WeatherStationDisplay(
    val label: String,
    val tempF: String,
    val weather: String,
    val icon: String,
    val snowDisplay: String,
    val snow24hDisplay: String,
    val snowState: String,
    val wind: String,
    val courses: String,
)

// ── Fetch results ──

data class SubResortData(
    val id: String,
    val name: String,
    val lifts: List<LiftInfo>?,
    val weather: List<WeatherStation>?,
    val stations: List<WeatherStationDisplay>? = null,
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
    ResortConfig("vail", "Vail", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("beavercreek", "Beaver Creek", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("breckenridge", "Breckenridge", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("keystone", "Keystone", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("crestedbutte", "Crested Butte", "America/Denver", "Colorado", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Utah
    ResortConfig("parkcity", "Park City Mountain", "America/Denver", "Utah", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Tahoe
    ResortConfig("heavenly", "Heavenly", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("northstar", "Northstar", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("kirkwood", "Kirkwood", "America/Los_Angeles", "Tahoe", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Pacific NW
    ResortConfig("stevenspass", "Stevens Pass", "America/Los_Angeles", "Pacific NW", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("whistlerblackcomb", "Whistler Blackcomb", "America/Vancouver", "British Columbia", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Vermont
    ResortConfig("stowe", "Stowe", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("okemo", "Okemo", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("mtsnow", "Mount Snow", "America/New_York", "Vermont", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // New Hampshire
    ResortConfig("mountsunapee", "Mount Sunapee", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("attitashmountain", "Attitash", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("wildcatmountain", "Wildcat Mountain", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("crotchedmountain", "Crotched Mountain", "America/New_York", "New Hampshire", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // New York
    ResortConfig("hunter", "Hunter Mountain", "America/New_York", "New York", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Mid-Atlantic
    ResortConfig("sevensprings", "Seven Springs", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("libertymountain", "Liberty Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("roundtopmountain", "Roundtop Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("whitetail", "Whitetail", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("jackfrostbigboulder", "Jack Frost / Big Boulder", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("hiddenvalleypa", "Hidden Valley PA", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("laurelmountain", "Laurel Mountain", "America/New_York", "Mid-Atlantic", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    // Midwest
    ResortConfig("aftonalps", "Afton Alps", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("mtbrighton", "Mt. Brighton", "America/Detroit", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("wilmotmountain", "Wilmot Mountain", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("alpinevalley", "Alpine Valley", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("bmbw", "Boston Mills / Brandywine", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("madrivermountain", "Mad River Mountain", "America/New_York", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("hiddenvalley", "Hidden Valley MO", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("snowcreek", "Snow Creek", "America/Chicago", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
    ResortConfig("paolipeaks", "Paoli Peaks", "America/Indiana/Indianapolis", "Midwest", ResortType.VAIL, Capabilities(weather = true, trailMap = true)),
)

val IKON_RESORTS = listOf(
    ResortConfig("alta", "Alta", "America/Denver", "Utah", ResortType.ALTA, Capabilities(weather = false, trailMap = true)),
    ResortConfig("snowbird", "Snowbird", "America/Denver", "Utah", ResortType.SNOWBIRD, Capabilities(weather = false, trailMap = true)),
)

val ALL_RESORTS = NISEKO_RESORTS + VAIL_RESORTS + IKON_RESORTS
