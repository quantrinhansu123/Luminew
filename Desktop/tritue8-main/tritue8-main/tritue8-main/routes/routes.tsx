import privateRoutes from "@/routes/privateRoutes";
import publicRoutes from "@/routes/publicRoutes";


const rootRoutes = [...publicRoutes, ...privateRoutes]

export default rootRoutes;
