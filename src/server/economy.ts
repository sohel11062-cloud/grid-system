let CURRENT_CONVERSION_RATE = 100;

export function getConversionRate() {
  return CURRENT_CONVERSION_RATE;
}

export function setConversionRate(
  value: number,
) {
  CURRENT_CONVERSION_RATE =
    value;
}