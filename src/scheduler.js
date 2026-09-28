function localDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startScheduler({ config, store, run }) {
  if (config.syncDailyHour == null) {
    return { enabled: false, hour: null, stop() {} };
  }
  const hour = config.syncDailyHour;
  const timer = setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== hour) return;
    const day = localDay(now);
    try {
      const last = await store.getState("auto_sync_day");
      if (last === day) return;
      await store.setState("auto_sync_day", day);
      console.info(`[sync] 开始每日增量同步 ${day} ${hour}:00`);
      await run("incremental");
    } catch (error) {
      console.error(`[sync] 每日增量同步失败：${error.message}`);
    }
  }, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return {
    enabled: true,
    hour,
    stop() {
      clearInterval(timer);
    },
  };
}
