export const toWorkDayOfWeek = (input: Date | string): number => {
  const date = input instanceof Date ? input : new Date(input);
  const jsDay = date.getDay(); // 0=Sunday, 1=Monday, ... 6=Saturday
  return jsDay === 0 ? 7 : jsDay; // 1=Monday ... 7=Sunday
};

