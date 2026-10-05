package dashboard

import (
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
)

type ProcInfo struct {
	PID   int32   `json:"pid"`
	Name  string  `json:"name"`
	CPU   float64 `json:"cpu"`
	RSSMB float64 `json:"rssMB"`
	Kind  string  `json:"kind"`
	RunID *string `json:"runId"`
	Cmd   string  `json:"cmd"`
}

type SystemSnapshot struct {
	T   string `json:"t"`
	CPU struct {
		Percent float64   `json:"percent"`
		PerCore []float64 `json:"perCore"`
		Cores   int       `json:"cores"`
		Model   string    `json:"model"`
	} `json:"cpu"`
	Mem struct {
		TotalMB float64 `json:"totalMB"`
		UsedMB  float64 `json:"usedMB"`
		Percent float64 `json:"percent"`
	} `json:"mem"`
	Processes []ProcInfo `json:"processes"`
	Host      struct {
		OS        string `json:"os"`
		Hostname  string `json:"hostname"`
		UptimeSec uint64 `json:"uptimeSec"`
	} `json:"host"`
}

type HistoryPoint struct {
	T   string  `json:"t"`
	CPU float64 `json:"cpu"`
	Mem float64 `json:"mem"`
}

const historyLen = 450 // 15 minutes at 2 s

type sysmon struct {
	pidRun func(pid int) *string

	mu      sync.Mutex
	last    SystemSnapshot
	history []HistoryPoint
	procs   map[int32]*process.Process
	model   string
}

func newSysmon(pidRun func(int) *string) *sysmon {
	s := &sysmon{pidRun: pidRun, procs: map[int32]*process.Process{}}
	if infos, err := cpu.Info(); err == nil && len(infos) > 0 {
		s.model = strings.TrimSpace(infos[0].ModelName)
	}
	return s
}

// sample takes one reading; withProcs also refreshes the Claude process list.
func (s *sysmon) sample(withProcs bool) SystemSnapshot {
	var snap SystemSnapshot
	now := time.Now()
	snap.T = now.Format(time.RFC3339)
	if per, err := cpu.Percent(0, true); err == nil {
		snap.CPU.PerCore = per
		total := 0.0
		for _, p := range per {
			total += p
		}
		if len(per) > 0 {
			snap.CPU.Percent = total / float64(len(per))
		}
	}
	snap.CPU.Cores = runtime.NumCPU()
	snap.CPU.Model = s.model
	if vm, err := mem.VirtualMemory(); err == nil {
		snap.Mem.TotalMB = float64(vm.Total) / 1048576
		snap.Mem.UsedMB = float64(vm.Used) / 1048576
		snap.Mem.Percent = vm.UsedPercent
	}
	if hi, err := host.Info(); err == nil {
		snap.Host.OS = hi.Platform + " " + hi.PlatformVersion
		snap.Host.Hostname = hi.Hostname
		snap.Host.UptimeSec = hi.Uptime
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if withProcs {
		snap.Processes = s.claudeProcs()
	} else {
		snap.Processes = s.last.Processes
	}
	if snap.Processes == nil {
		snap.Processes = []ProcInfo{}
	}
	s.last = snap
	s.history = append(s.history, HistoryPoint{T: snap.T, CPU: snap.CPU.Percent, Mem: snap.Mem.Percent})
	if len(s.history) > historyLen {
		s.history = s.history[len(s.history)-historyLen:]
	}
	return snap
}

func (s *sysmon) claudeProcs() []ProcInfo {
	all, err := process.Processes()
	if err != nil {
		return nil
	}
	alive := map[int32]bool{}
	var out []ProcInfo
	for _, p := range all {
		name, err := p.Name()
		if err != nil || !strings.HasPrefix(strings.ToLower(name), "claude") {
			continue
		}
		alive[p.Pid] = true
		tracked := s.procs[p.Pid]
		if tracked == nil {
			tracked = p
			s.procs[p.Pid] = p
			_, _ = p.Percent(0) // prime the CPU counter
		}
		pct, _ := tracked.Percent(0)
		info := ProcInfo{PID: p.Pid, Name: name, CPU: pct / float64(runtime.NumCPU()), Kind: "claude"}
		if mi, err := p.MemoryInfo(); err == nil {
			info.RSSMB = float64(mi.RSS) / 1048576
		}
		if cmd, err := p.Cmdline(); err == nil {
			info.Cmd = truncate(cmd, 160)
		}
		if run := s.pidRun(int(p.Pid)); run != nil {
			info.Kind, info.RunID = "run", run
		} else if ppid, err := p.Ppid(); err == nil {
			if run := s.pidRun(int(ppid)); run != nil {
				info.Kind, info.RunID = "run", run
			}
		}
		out = append(out, info)
	}
	for pid := range s.procs {
		if !alive[pid] {
			delete(s.procs, pid)
		}
	}
	return out
}

func (s *sysmon) snapshot() SystemSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.last
}

func (s *sysmon) historyPoints() []HistoryPoint {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]HistoryPoint{}, s.history...)
}
