/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Plus, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const FiltersAndSearchBar = ({
  searchTerm,
  setSearchTerm,
  setFilters,
  toggleFormOpen,
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  setFilters: (filters: any) => void;
  toggleFormOpen: (open: boolean) => void; // Updated type definition
}) => (
  <div className="flex gap-4 items-center">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search vehicles..."
        className="pl-8"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Filters <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 p-4 space-y-4">
        <Input
          placeholder="Make"
          onChange={(e) =>
            setFilters((prev: any) => ({ ...prev, make: e.target.value }))
          }
        />
        <Input
          placeholder="Model"
          onChange={(e) =>
            setFilters((prev: any) => ({ ...prev, model: e.target.value }))
          }
        />
        <Input
          placeholder="Status"
          onChange={(e) =>
            setFilters((prev: any) => ({ ...prev, status: e.target.value }))
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>

    <Button
      variant="outline"
      onClick={() => toggleFormOpen(true)} // Pass true when opening
      className="ml-4"
    >
      <Plus className="mr-2 h-4 w-4" />
      Add Vehicle
    </Button>
  </div>
);
