import { useEffect, useState } from "react";

export function useMeterReading(modalOpen: boolean, licensePlate?: string) {
  const [lastOdometer, setLastOdometer] = useState<number>(0);
  const [currentOdometer, setCurrentOdometer] = useState<number | undefined>(
    undefined
  );
  const [reading, setReading] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Fetch last odometer when modal opens
  useEffect(() => {
    if (!modalOpen || !licensePlate) return;

    const fetchLastOdometer = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/meterlogs/last?license_plate=${licensePlate}`
        );
        const data = await res.json();
        setLastOdometer(data?.odometer || 0);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch last odometer", err);
        setLastOdometer(0);
        setLoading(false);
      }
    };

    fetchLastOdometer();
  }, [modalOpen, licensePlate]);

  // Update reading when current odometer changes
  useEffect(() => {
    if (currentOdometer !== undefined) {
      setReading(currentOdometer - lastOdometer);
    }
  }, [currentOdometer, lastOdometer]);

  return {
    lastOdometer,
    currentOdometer,
    setCurrentOdometer,
    reading,
    loading,
  };
}
