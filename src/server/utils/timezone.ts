export function validatePlausibility(referenceDate: string, timezoneOffset: number) {
  const serverNow = new Date();
  
  // Calcula a hora local aproximada do usuário baseada no offset enviado
  // timezoneOffset é a diferença em minutos de UTC para Local (ex: 180 para UTC-3)
  const userLocalNow = new Date(serverNow.getTime() - timezoneOffset * 60000);
  const userLocalDateStr = userLocalNow.toISOString().split('T')[0];
  
  const refDateObj = new Date(`${referenceDate}T00:00:00Z`);
  const userLocalObj = new Date(`${userLocalDateStr}T00:00:00Z`);
  
  // Diferença em dias absolutos
  const diffDays = Math.abs((refDateObj.getTime() - userLocalObj.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 1) {
    throw new Error('Data de referência fora da janela de tolerância permitida (+/- 1 dia).');
  }
}

/**
 * Mutations that close a nutrition day must use the current civil date for the
 * supplied browser offset. Unlike validatePlausibility, adjacent days are not
 * accepted. The offset remains client-provided by the V1 contract.
 */
export function validateCurrentReferenceDate(
  referenceDate: string,
  timezoneOffset: number,
  now: Date = new Date(),
) {
  const localToday = new Date(now.getTime() - timezoneOffset * 60000).toISOString().slice(0, 10);
  if (referenceDate !== localToday) {
    throw new Error('A consolidação deve usar a data local atual.');
  }
}

export function getDayBounds(referenceDate: string, timezoneOffset: number) {
  // Cria uma data representando meia-noite abstrata na string
  const localMidnightUTC = new Date(`${referenceDate}T00:00:00Z`);
  
  // Adiciona o offset para chegar na representação real em UTC do início do dia no fuso do usuário
  const startOfDayUTC = new Date(localMidnightUTC.getTime() + timezoneOffset * 60000);
  
  // O fim do dia é o início + 24 horas - 1 milissegundo
  const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
  
  return { startOfDayUTC, endOfDayUTC };
}

/**
 * Interpret both selected dates in the same IANA zone. The end date is inclusive
 * to the caller; queries should use gte startInclusiveUTC and lt endExclusiveUTC.
 * This does not use or change the fixed-offset semantics of getDayBounds.
 */
export function getLocalDateRangeBounds(startDate: string, endDate: string, timeZone: string) {
  const parseDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
      throw new RangeError('Data inválida. Use uma data real no formato YYYY-MM-DD.');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new RangeError('Data inválida. Use uma data real no formato YYYY-MM-DD.');
    }
    return date;
  };
  const first = parseDate(startDate);
  const last = parseDate(endDate);
  if (first > last) throw new RangeError('A data inicial deve ser anterior ou igual à data final.');

  // Intl also accepts numeric offsets on some runtimes; this contract requires a
  // named zone (including UTC), not a fixed offset or the server's default zone.
  if (typeof timeZone !== 'string' || !timeZone || timeZone.trim() !== timeZone || /^[+-]/.test(timeZone)) {
    throw new RangeError('Fuso IANA inválido.');
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn',
      era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch {
    throw new RangeError('Fuso IANA inválido.');
  }

  const calendarKey = (date: Date) => date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const localKey = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
    const year = part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'));
    return year * 10000 + Number(part('month')) * 100 + Number(part('day'));
  };

  const dayStart = (date: Date) => {
    const target = calendarKey(date);
    // Bracket the civil-day boundary, then resolve it to the millisecond using
    // the runtime's IANA rules. No assumption that a local day lasts 24 hours.
    const margin = 48 * 60 * 60 * 1000;
    let low = date.getTime() - margin;
    let high = date.getTime() + margin;
    while (high - low > 1) {
      const middle = low + Math.floor((high - low) / 2);
      if (localKey(middle) < target) low = middle;
      else high = middle;
    }
    return high;
  };

  const start = dayStart(first);
  const lastStart = dayStart(last);
  // Some IANA transitions skip an entire civil date. Do not normalize a selected
  // nonexistent date silently. A skipped day inside the interval adds no instants.
  if (localKey(start) !== calendarKey(first) || localKey(lastStart) !== calendarKey(last)) {
    throw new RangeError('Uma das datas selecionadas não existe no fuso informado.');
  }
  const nextDate = new Date(last);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { startInclusiveUTC: new Date(start), endExclusiveUTC: new Date(dayStart(nextDate)) };
}
