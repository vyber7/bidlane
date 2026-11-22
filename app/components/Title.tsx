interface TitleProps {
  id: string;
  children: string;
}

export default function Title({ id, children }: TitleProps) {
  return <h3 id={id} className="break-words p-2 font-bold">{children}</h3>;
}
