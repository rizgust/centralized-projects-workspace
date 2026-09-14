// Package config loads control/.env (gitignored) into the process environment.
package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// LoadEnvFile sets environment variables from a simple KEY=VALUE file,
// skipping blanks and #-comments, without overriding vars already set.
func LoadEnvFile(path string) error {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

type Config struct {
	TelegramBotToken string
	TelegramMasterID int64 // 0 = not yet configured
	MaxBudgetSafe    float64
	MaxBudgetFull    float64
}

func Load() Config {
	masterID, _ := strconv.ParseInt(os.Getenv("TELEGRAM_MASTER_USER_ID"), 10, 64)
	safe := 2.0
	if v, err := strconv.ParseFloat(os.Getenv("PCCTL_MAX_BUDGET_SAFE"), 64); err == nil {
		safe = v
	}
	full := 10.0
	if v, err := strconv.ParseFloat(os.Getenv("PCCTL_MAX_BUDGET_FULL"), 64); err == nil {
		full = v
	}
	return Config{
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramMasterID: masterID,
		MaxBudgetSafe:    safe,
		MaxBudgetFull:    full,
	}
}
