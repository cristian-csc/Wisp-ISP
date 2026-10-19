import React from "react";
import { Card } from "../ui/card";

interface MyAppProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
  className?: string;
}
const CardBox: React.FC<MyAppProps> = ({ children, className, ...props }) => {
  return (
    <Card className={`card no-inset no-ring ${className} shadow-sm border border-ld rounded-lg w-full`} {...props}>
      {children}
    </Card>
  );

};
export default CardBox;
