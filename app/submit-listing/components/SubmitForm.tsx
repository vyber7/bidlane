"use client";

import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import axios from "axios";
import toast from "react-hot-toast";
import { useState } from "react";
import Button from "../../components/Button";
import SubmitInput from "./SubmitInput";
import { useRouter } from "next/navigation";

// interface SubmitFormProps {
//   userId: string | undefined;
// }

const SubmitForm: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: {
      year: 2000,
      make: "",
      model: "",
      miles: 20,
      reservePrice: 2000,
      location: "Miami, FL",
      description:
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
    },
  });

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);
    axios
      .post("/api/new-listing", { data })
      .then((res) => {
        const listingId = res.data.id;
        toast.success("Listing submitted successfully!");
        router.push(`/listing/${listingId}`);
      })
      .catch((e) => toast.error("Something went wrong!", e))
      .finally(() => {
        setIsLoading(false);
      });
  };

  //const folder = "car-auctions-" + userId;

  return (
    <>
      <form
        className="flex flex-col flex-nowrap lg:flex-row lg:flex-wrap lg:justify-between"
        name="submit"
        onSubmit={handleSubmit(onSubmit)}
      >
        <SubmitInput
          // className="mb-5 h-8 w-full md:w-52 rounded border"
          type="text"
          id="make"
          label="Make"
          register={register}
          //name="make"
          errors={errors}
          disabled={isLoading}
        />

        <SubmitInput
          //className="mb-5 h-8 w-full md:w-52 rounded border"
          type="text"
          id="model"
          label="Model"
          register={register}
          //name="model"
          errors={errors}
          disabled={isLoading}
        />

        <SubmitInput
          //className="mb-5 h-8 w-full md:w-52 rounded border"
          type="number"
          id="year"
          label="Year"
          register={register}
          //name="year"
          errors={errors}
          disabled={isLoading}
        />

        <SubmitInput
          //className="mb-5 h-8 w-full md:w-52 rounded border"
          type="number"
          id="miles"
          label="Miles"
          register={register}
          //name="miles"
          errors={errors}
          disabled={isLoading}
        />

        <SubmitInput
          //className="mb-5 h-8 w-full md:w-52 rounded border"
          type="number"
          id="reservePrice"
          label="Reserve Price (optional)"
          register={register}
          //name="reservePrice"
          errors={errors}
          disabled={isLoading}
        />

        <SubmitInput
          //className="mb-5 h-8 w-full md:w-52 rounded border"
          type="text"
          id="location"
          label="Location"
          register={register}
          //name="location"
          errors={errors}
          disabled={isLoading}
        />

        <label className="w-full pb-2" htmlFor="description">
          Description
        </label>
        <textarea
          className="form-textarea border-gray-300 mb-4 h-32 w-full resize-none rounded-md p-2 bg-white shadow-sm focus:border-transparent focus:ring focus:ring-gray-500 placeholder:text-gray-400 hover:ring hover:ring-gray-500"
          id="description"
          //name="description"
          {...register("description", { required: true })}
        />

        {/* <label className="pb-2 w-full" htmlFor="images">
        Drag images below or{" "} */}

        {/* <CldUploadWidget
        options={{
          maxFiles: 10,
          resourceType: "image",
          folder: folder,
        }}
        onSuccess={handleUpload}
        uploadPreset="auctions"
      >
        {({ open }) => {
          return (
            <button
              type="button"
              onClick={() => open?.()}
              className="w-full text-blue-500 underline mb-4"
            >
              Or Click Here to Upload Images
            </button>
          );
        }}
      </CldUploadWidget> */}
        {/* </label> */}
        {/* <textarea
        className="mb-4 h-32 w-full resize-none rounded border border-dashed border-gray-400 bg-gray-100 p-2"
        id="images"
        name="images"
        disabled
      /> */}

        {/* get images from cloudinary */}
        {/* You can use getCldImageUrl to dynamically generate image URLs */}
        {/* Example: getCldImageUrl("car-auctions/hgo6bhwzmv7zugjojsvm") */}

        {/* displays uploaded images */}

        {/* end display uploaded images */}

        <Button type="submit" disabled={isLoading}>
          Continue
        </Button>
      </form>
    </>
  );
};

export default SubmitForm;
