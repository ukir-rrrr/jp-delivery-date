import type { LocalDate } from "../../domain/calendar/local-date";
import type { DeliveryOrderInput } from "../../domain/order/normalize-order";
import { adminGraphql, type AdminClient } from "../graphql/admin";

export const ORDER_PAGE_SIZE = 50;

const ORDER_FIELDS = `
  id
  name
  displayFulfillmentStatus
  phone
  customAttributes { key value }
  shippingAddress {
    name
    phone
    zip
    province
    city
    address1
    address2
  }
  lineItems(first: 20) {
    pageInfo { hasNextPage }
    nodes { title }
  }
`;

const ORDERS_QUERY = `#graphql
  query DeliveryOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ${ORDER_FIELDS} }
    }
  }
`;

const NODES_QUERY = `#graphql
  query ExportOrderNodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Order { ${ORDER_FIELDS} }
    }
  }
`;

export interface OrderNode {
  id: string;
  name: string;
  displayFulfillmentStatus: string | null;
  phone: string | null;
  customAttributes: { key: string; value: string | null }[];
  shippingAddress: {
    name: string | null;
    phone: string | null;
    zip: string | null;
    province: string | null;
    city: string | null;
    address1: string | null;
    address2: string | null;
  } | null;
  lineItems: {
    pageInfo: { hasNextPage: boolean };
    nodes: { title: string }[];
  };
}

export interface OrderPage {
  nodes: OrderNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export async function fetchOrderPage(
  admin: AdminClient,
  after: string | null,
): Promise<OrderPage> {
  const data = await adminGraphql<{
    orders: OrderPage;
  }>(admin, ORDERS_QUERY, {
    first: ORDER_PAGE_SIZE,
    after,
    query: "-status:cancelled",
  });
  return data.orders;
}

export async function fetchOrdersByIds(
  admin: AdminClient,
  ids: readonly string[],
): Promise<OrderNode[]> {
  if (ids.length === 0) return [];
  const data = await adminGraphql<{
    nodes: (({ __typename?: string } & Partial<OrderNode>) | null)[];
  }>(admin, NODES_QUERY, { ids });
  const orders: OrderNode[] = [];
  for (const node of data.nodes) {
    if (!node || node.__typename !== "Order" || !node.id || !node.name || !node.lineItems || !node.customAttributes) {
      continue;
    }
    orders.push(node as OrderNode);
  }
  return orders;
}

export function orderToInput(node: OrderNode, shipDate: LocalDate): DeliveryOrderInput {
  const shipping = node.shippingAddress;
  return {
    orderId: node.id,
    orderName: node.name,
    contactPhone: node.phone,
    shipping: shipping
      ? {
          name: shipping.name,
          phone: shipping.phone,
          postalCode: shipping.zip,
          province: shipping.province,
          city: shipping.city,
          address1: shipping.address1,
          address2: shipping.address2,
        }
      : null,
    attributes: node.customAttributes.map((attribute) => ({
      key: attribute.key,
      value: attribute.value,
    })),
    lineItems: node.lineItems.nodes.map((item) => item.title),
    lineItemsTruncated: node.lineItems.pageInfo.hasNextPage,
    shipDate,
  };
}
