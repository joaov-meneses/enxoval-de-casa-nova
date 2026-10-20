import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
export function UserAvatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={`user-avatar ${className}`} aria-hidden="true">
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-transparent text-inherit">
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
