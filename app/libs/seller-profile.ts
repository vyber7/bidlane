import { getReadRepositories } from "./read-repositories";

export async function getSellerProfile(id: string, page = 1) {
  const { sellers } = getReadRepositories();
  const seller = await sellers.find(id);
  if (!seller) return null;
  const [salesCount, active, sales] = await Promise.all([
    sellers.salesCount(id), sellers.active(id), sellers.sales(id, page),
  ]);
  return { seller, salesCount, active, sales };
}
