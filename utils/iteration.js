// utils/iteration.js

/**
 * Calculate the current iteration based on the project's start date and sprint unit.
 * @param {string} startDateStr - The project's start date (ISO string).
 * @param {number} sprintUnit - The number of days in one sprint.
 * @returns {{sprint: string, period: string}} - The current sprint index and period.
 */
export function calculateIteration(startDateStr, sprintUnit) {
  const start = new Date(startDateStr);
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysPassed = Math.floor((today - start) / msPerDay);

  const sprintIndex = Math.floor(daysPassed / sprintUnit) + 1;

  const sprintStart = new Date(start);
  sprintStart.setDate(sprintStart.getDate() + (sprintIndex - 1) * sprintUnit);

  const sprintEnd = new Date(sprintStart);
  sprintEnd.setDate(sprintStart.getDate() + sprintUnit - 1);

  const format = (d) => `${d.getMonth() + 1}.${d.getDate()}`;

  return {
    sprint: sprintIndex.toString(),
    period: `${format(sprintStart)} ~ ${format(sprintEnd)}`
  };
}


export function calculateIterationFromDate(date, startDate, sprintUnit) {
  const created = new Date(date);
  const start = new Date(startDate);
  const diffTime = created - start;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const sprint = Math.floor(diffDays / sprintUnit) + 1;
  return Math.max(sprint, 1); // 🔥 최소 1로 고정
}


