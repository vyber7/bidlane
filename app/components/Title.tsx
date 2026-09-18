interface TitleProps {
  year: number;
  make: string;
  model: string;
  large?: boolean;
}

const Title: React.FC<TitleProps> = ({ year, make, model, large }) => {
  const capitalized = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const title = `${year} ${capitalized(make)} ${capitalized(model)}`;

  if (large)
    return (
      <h1 className="p-2 md:p-4 text-lg md:text-xl font-bold rounded-t-md shadow-md shadow-gray-400 bg-white">
        {title}
      </h1>
    );
  else return <h1 className="p-2 font-bold text-md">{title}</h1>;
};

export default Title;
