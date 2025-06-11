// "use client";

// import VehicleCard from "../card/VehicleCard";

// interface Vehicle {
//   _id?: string;
//   license_plate: string;
//   make: string;
//   model: string;
//   year: number;
//   vehicle_type: string;
//   purchase_date: string;
//   fuel_type: string;
// }

// interface Props {
//   vehicles: Vehicle[];
//   refresh: () => void;
// }

// const VehicleList = ({ vehicles, refresh }: Props) => {
//   if (!vehicles.length) {
//     return <p className="text-muted-foreground">No vehicles available.</p>;
//   }

//   return (
//     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//       {vehicles.map((vehicle) => (
//         <VehicleCard key={vehicle._id} vehicle={vehicle} refresh={refresh} />
//       ))}
//     </div>
//   );
// };

// export default VehicleList;
