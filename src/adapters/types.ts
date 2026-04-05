import type React from "react";

export interface ServiceAdapter {
  id: string;
  name: string;
  description: string;
  icon: string;
  render: (query: string) => React.ReactNode;
}
