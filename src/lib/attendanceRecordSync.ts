interface AttendanceRecordLike {
  check_in_time?: string | null;
  check_out_time?: string | null;
}

function getAttendanceProgressScore(record: AttendanceRecordLike | null | undefined): number {
  if (!record) return 0;
  if (record.check_out_time) return 2;
  if (record.check_in_time) return 1;
  return 0;
}

export function reconcileTodayAttendance<T extends AttendanceRecordLike>(
  serverRecord: T | null,
  localRecord: T | null
): T | null {
  const serverScore = getAttendanceProgressScore(serverRecord);
  const localScore = getAttendanceProgressScore(localRecord);

  if (localScore > serverScore) {
    return localRecord;
  }

  return serverRecord ?? localRecord ?? null;
}
