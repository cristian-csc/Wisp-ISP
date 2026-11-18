import React from "react";
import { Card } from "../ui/card";

interface MyAppProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
  className?: string;
}
const CardBox: React.FC<MyAppProps> = ({ children, className, ...props }) => {
  return (
    <Card className={`card no-inset no-ring rounded-xl border border-ld w-full shadow-none ${className ?? ''}`} {...props}>
      {children}
    </Card>
  );

};
export default CardBox;
