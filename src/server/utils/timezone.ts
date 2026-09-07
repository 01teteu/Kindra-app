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

export function getDayBounds(referenceDate: string, timezoneOffset: number) {
  // Cria uma data representando meia-noite abstrata na string
  const localMidnightUTC = new Date(`${referenceDate}T00:00:00Z`);
  
  // Adiciona o offset para chegar na representação real em UTC do início do dia no fuso do usuário
  const startOfDayUTC = new Date(localMidnightUTC.getTime() + timezoneOffset * 60000);
  
  // O fim do dia é o início + 24 horas - 1 milissegundo
  const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
  
  return { startOfDayUTC, endOfDayUTC };
}
