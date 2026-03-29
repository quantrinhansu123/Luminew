/**
 * Cùng công thức `useEffect` trong NhapDonMoi.jsx (lên đơn):
 * `tong-tien` = `sale_price` * `exchange_rate`
 */
export function totalAmountVndFromLenDonFormula(salePriceRaw, exchangeRateRaw) {
  const price = parseFloat(salePriceRaw) || 0;
  const rate = parseFloat(exchangeRateRaw) || 0;
  return price * rate;
}
