package dashboard

import (
	"math"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// Prayer times are computed offline with the standard astronomical method
// (the praytimes.org formulation), using Kemenag RI parameters by default:
// Subuh at -20°, Isya at -18°, Ashar by the Syafi'i shadow ratio (1), sunset
// at -0.833°, plus ihtiyat minutes added to every time.

type PrayerConfig struct {
	City         string  `yaml:"city" json:"city"`
	Lat          float64 `yaml:"lat" json:"lat"`
	Lon          float64 `yaml:"lon" json:"lon"`
	Timezone     string  `yaml:"timezone" json:"timezone"`
	FajrAngle    float64 `yaml:"fajr_angle" json:"fajrAngle"`
	IshaAngle    float64 `yaml:"isha_angle" json:"ishaAngle"`
	AsrFactor    float64 `yaml:"asr_factor" json:"asrFactor"`
	ElevationM   float64 `yaml:"elevation_m" json:"elevationM"`
	IhtiyatMin   int     `yaml:"ihtiyat_min" json:"ihtiyatMin"`
	WindowMin    int     `yaml:"window_min" json:"windowMin"`
	HoldLaunches bool    `yaml:"hold_launches" json:"holdLaunches"`
	Enabled      bool    `yaml:"enabled" json:"enabled"`
}

func defaultPrayerConfig() PrayerConfig {
	return PrayerConfig{
		City: "Malang", Lat: -7.9797, Lon: 112.6304, Timezone: "Asia/Jakarta",
		FajrAngle: 20, IshaAngle: 18, AsrFactor: 1, IhtiyatMin: 2,
		WindowMin: 20, HoldLaunches: true, Enabled: true,
	}
}

func loadPrayerConfig(root string) PrayerConfig {
	c := defaultPrayerConfig()
	var w struct {
		Prayer *PrayerConfig `yaml:"prayer"`
	}
	if b, err := os.ReadFile(filepath.Join(root, "workspace.yaml")); err == nil {
		w.Prayer = &c
		_ = yaml.Unmarshal(b, &w)
	}
	return c
}

type PrayerTime struct {
	Name string `json:"name"` // subuh | dzuhur | ashar | maghrib | isya
	At   string `json:"at"`   // RFC 3339
	HHMM string `json:"hhmm"`
}

type PrayerStatus struct {
	Config  PrayerConfig `json:"config"`
	Date    string       `json:"date"`
	Sunrise string       `json:"sunrise"`
	Times   []PrayerTime `json:"times"`
	Next    *PrayerTime  `json:"next"`
	Active  *struct {
		Name      string `json:"name"`
		StartedAt string `json:"startedAt"`
		EndsAt    string `json:"endsAt"`
	} `json:"active"`
}

var prayerNames = []string{"subuh", "dzuhur", "ashar", "maghrib", "isya"}

func deg(x float64) float64 { return x * math.Pi / 180 }
func rad(x float64) float64 { return x * 180 / math.Pi }

// sunPosition returns declination (degrees) and equation of time (hours) for a Julian day.
func sunPosition(jd float64) (decl, eqt float64) {
	d := jd - 2451545.0
	g := math.Mod(357.529+0.98560028*d, 360)
	q := math.Mod(280.459+0.98564736*d, 360)
	l := math.Mod(q+1.915*math.Sin(deg(g))+0.020*math.Sin(deg(2*g)), 360)
	e := 23.439 - 0.00000036*d
	ra := rad(math.Atan2(math.Cos(deg(e))*math.Sin(deg(l)), math.Cos(deg(l)))) / 15
	ra = math.Mod(ra+24, 24)
	decl = rad(math.Asin(math.Sin(deg(e)) * math.Sin(deg(l))))
	eqt = q/15 - ra
	eqt = math.Mod(eqt+12, 24) - 12
	return
}

func julian(y int, m time.Month, d int) float64 {
	yy, mm := y, int(m)
	if mm <= 2 {
		yy--
		mm += 12
	}
	a := math.Floor(float64(yy) / 100)
	b := 2 - a + math.Floor(a/4)
	return math.Floor(365.25*float64(yy+4716)) + math.Floor(30.6001*float64(mm+1)) + float64(d) + b - 1524.5
}

// hourAngle is the time in hours from solar noon until the sun reaches altitude alt.
func hourAngle(alt, lat, decl float64) float64 {
	c := (math.Sin(deg(alt)) - math.Sin(deg(lat))*math.Sin(deg(decl))) / (math.Cos(deg(lat)) * math.Cos(deg(decl)))
	return rad(math.Acos(math.Max(-1, math.Min(1, c)))) / 15
}

// computeDay returns sunrise and the five prayer times for a local date.
func computeDay(c PrayerConfig, day time.Time) (time.Time, []PrayerTime) {
	loc := day.Location()
	_, offset := time.Date(day.Year(), day.Month(), day.Day(), 12, 0, 0, 0, loc).Zone()
	tz := float64(offset) / 3600
	jd := julian(day.Year(), day.Month(), day.Day()) - c.Lon/(15*24)
	decl, eqt := sunPosition(jd + 0.5)
	noon := 12 + tz - c.Lon/15 - eqt
	sunAlt := -0.8333 - 0.0347*math.Sqrt(math.Max(0, c.ElevationM))
	asrAlt := rad(math.Atan(1 / (c.AsrFactor + math.Tan(deg(math.Abs(c.Lat-decl))))))
	hours := map[string]float64{
		"subuh":   noon - hourAngle(-c.FajrAngle, c.Lat, decl),
		"dzuhur":  noon,
		"ashar":   noon + hourAngle(asrAlt, c.Lat, decl),
		"maghrib": noon + hourAngle(sunAlt, c.Lat, decl),
		"isya":    noon + hourAngle(-c.IshaAngle, c.Lat, decl),
	}
	base := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc)
	at := func(h float64, extra int) time.Time {
		t := base.Add(time.Duration(h * float64(time.Hour))).Add(time.Duration(extra) * time.Minute)
		if t.Second() > 0 || t.Nanosecond() > 0 { // round up to the next whole minute
			t = t.Truncate(time.Minute).Add(time.Minute)
		}
		return t
	}
	sunrise := at(noon-hourAngle(sunAlt, c.Lat, decl), 0)
	out := make([]PrayerTime, 0, 5)
	for _, n := range prayerNames {
		t := at(hours[n], c.IhtiyatMin)
		out = append(out, PrayerTime{Name: n, At: t.Format(time.RFC3339), HHMM: t.Format("15:04")})
	}
	return sunrise, out
}

// prayerStatus reports today's times, the next prayer, and the active sholat window.
func prayerStatus(c PrayerConfig, now time.Time) PrayerStatus {
	loc, err := time.LoadLocation(c.Timezone)
	if err != nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	now = now.In(loc)
	sunrise, today := computeDay(c, now)
	st := PrayerStatus{Config: c, Date: now.Format("2006-01-02"), Sunrise: sunrise.Format("15:04"), Times: today}
	window := time.Duration(c.WindowMin) * time.Minute
	for _, p := range today {
		t, _ := time.Parse(time.RFC3339, p.At)
		if c.Enabled && !now.Before(t) && now.Before(t.Add(window)) {
			st.Active = &struct {
				Name      string `json:"name"`
				StartedAt string `json:"startedAt"`
				EndsAt    string `json:"endsAt"`
			}{p.Name, p.At, t.Add(window).Format(time.RFC3339)}
		}
		if st.Next == nil && t.After(now) {
			p := p
			st.Next = &p
		}
	}
	if st.Next == nil {
		_, tomorrow := computeDay(c, now.AddDate(0, 0, 1))
		st.Next = &tomorrow[0]
	}
	return st
}
