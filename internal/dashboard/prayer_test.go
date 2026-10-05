package dashboard

import (
	"testing"
	"time"
)

// Official Bimas Islam Kemenag RI schedules for Kota Malang, as republished by
// JawaPos (17 Apr 2026) and detikJatim (26 Oct 2025; its "04.46" Subuh is a typo
// for 03.46, given Imsak 03.36). Kemenag rounds and adds ihtiyat its own way,
// so allow ±2 minutes.
func TestMalangPrayerTimes(t *testing.T) {
	c := defaultPrayerConfig()
	loc, _ := time.LoadLocation(c.Timezone)
	cases := []struct {
		day  time.Time
		want map[string]string
	}{
		{time.Date(2026, 4, 17, 8, 0, 0, 0, loc), map[string]string{"subuh": "04:16", "dzuhur": "11:33", "ashar": "14:52", "maghrib": "17:30", "isya": "18:39"}},
		{time.Date(2025, 10, 26, 8, 0, 0, 0, loc), map[string]string{"subuh": "03:46", "dzuhur": "11:17", "ashar": "14:27", "maghrib": "17:27", "isya": "18:38"}},
	}
	for _, tc := range cases {
		_, times := computeDay(c, tc.day)
		for _, p := range times {
			w, _ := time.ParseInLocation("15:04", tc.want[p.Name], loc)
			g, _ := time.ParseInLocation("15:04", p.HHMM, loc)
			if d := g.Sub(w); d < -2*time.Minute || d > 2*time.Minute {
				t.Errorf("%s %s = %s, Kemenag %s", tc.day.Format("2006-01-02"), p.Name, p.HHMM, tc.want[p.Name])
			}
			t.Logf("%s %-8s %s (Kemenag %s)", tc.day.Format("2006-01-02"), p.Name, p.HHMM, tc.want[p.Name])
		}
	}
}

func TestActiveWindow(t *testing.T) {
	c := defaultPrayerConfig()
	loc, _ := time.LoadLocation(c.Timezone)
	_, times := computeDay(c, time.Date(2026, 10, 5, 8, 0, 0, 0, loc))
	dz, _ := time.Parse(time.RFC3339, times[1].At)
	if st := prayerStatus(c, dz.Add(5*time.Minute)); st.Active == nil || st.Active.Name != "dzuhur" {
		t.Fatalf("expected dzuhur active 5 min after adhan, got %+v", st.Active)
	}
	if st := prayerStatus(c, dz.Add(25*time.Minute)); st.Active != nil {
		t.Fatalf("expected no active window 25 min after adhan, got %+v", st.Active)
	}
	if st := prayerStatus(c, dz.Add(-time.Minute)); st.Next == nil || st.Next.Name != "dzuhur" {
		t.Fatalf("expected next = dzuhur, got %+v", st.Next)
	}
}
