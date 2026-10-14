import prisma from "./db.server";

/** Order IDs only. Customer name, address, and phone never reach this table. */
export async function exportedOrderIds(
  shop: string,
  carrier: string,
  orderIds: readonly string[],
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await prisma.exportLog.findMany({
    where: { shop, carrier, orderId: { in: [...orderIds] } },
    select: { orderId: true },
  });
  return new Set(rows.map((row) => row.orderId));
}

export async function recordExportedOrders(
  shop: string,
  carrier: string,
  orderIds: readonly string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  await prisma.exportLog.createMany({
    data: orderIds.map((orderId) => ({ shop, orderId, carrier })),
  });
}
