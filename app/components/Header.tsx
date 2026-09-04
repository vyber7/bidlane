"use client";

import Avatar from "./Avatar";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { Url } from "next/dist/shared/lib/router/router";
import { RiHome2Fill } from "react-icons/ri";
import clsx from "clsx";

import { FiChevronRight, FiChevronDown } from "react-icons/fi";

function Header() {
  const [chevron, setChevron] = useState(false);
  const { data: session } = useSession();
  const user = session?.user;

  const label = useRef<HTMLLabelElement>(null);
  // Set up ref for nav bar
  const popupNav = useRef<HTMLDivElement>(null);
  // Set up ref for profile dropdown
  const profileLabel = useRef<HTMLLabelElement>(null);
  // Set up ref for auctions dropdown
  const auctionsLabel = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    /**
     * Handles click outside of the component.
     * If the click is outside of the component and the checkbox is checked, it will click the component.
     * @param event - The MouseEvent object.
     */
    function handleClickOutside(event: MouseEvent) {
      if (
        label.current &&
        !label.current.contains(event.target as Node) &&
        !popupNav.current?.contains(event.target as Node)
      ) {
        const checkbox = document.getElementById(
          "checkbox"
        ) as HTMLInputElement;
        if (checkbox?.checked) label.current.click();
      }

      if (
        profileLabel.current &&
        !profileLabel.current.contains(event.target as Node)
      ) {
        const checkbox = document.getElementById(
          "profile-checkbox"
        ) as HTMLInputElement;
        if (checkbox?.checked) profileLabel.current.click();
      }
      if (
        auctionsLabel.current &&
        !auctionsLabel.current.contains(event.target as Node)
      ) {
        const checkbox = document.getElementById(
          "auction-checkbox"
        ) as HTMLInputElement;
        if (checkbox?.checked) {
          auctionsLabel.current.click();
          setChevron(checkbox.checked);
        }
      }
    }

    document.addEventListener("click", handleClickOutside);

    /*  
    
    // Hide header on scroll down and show on scroll up
    //let prevScrollPos = window.scrollY;
    // Get the nav bar element

    window.onscroll = function () {
      const currentScrollPos = window.scrollY;
      if (header.current) {
        if (prevScrollPos > currentScrollPos) {
          header.current.classList.remove("hidden");
        } else {
          header.current.classList.add("hidden");
        }
      }
      prevScrollPos = currentScrollPos;
    };

    // Hide header on swipe up and show on swipe down
    // Set initial position and direction
    let startY: number | undefined = 0;
    let direction = "";

    // Add touchstart event listener
    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY;
    };
    document.addEventListener("touchstart", handleTouchStart);

    // Add touchmove event listener
    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY;
      // Determine swipe direction
      if (currentY && startY) {
        if (currentY < startY) {
          direction = "up";
        } else {
          direction = "down";
        }
      }
    };
    document.addEventListener("touchmove", handleTouchMove);

    // Add touchend event listener
    const handleTouchEnd = () => {
      // If swipe up, hide nav bar
      if (header.current) {
        if (direction === "up") {
          header.current.classList.add("hidden");
        }
        // If swipe down, show nav bar
        else if (direction === "down") {
          header.current.classList.remove("hidden");
        }
      }
    };
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchend", handleTouchEnd);

    // Cleanup 
    
    */
    return () => {
      document.removeEventListener("click", handleClickOutside);
      // document.removeEventListener("touchstart", handleTouchStart);
      // document.removeEventListener("touchmove", handleTouchMove);
      // document.removeEventListener("touchend", handleTouchEnd);
      // window.onscroll = null;
    };
  }, [label]);

  const navLinks = [
    { name: "Submit a Vehicle", href: "/submit-listing" },
    // { name: "Auctions", href: "/" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
  ];

  const profileLinks = [
    { name: "Profile", href: "/account/profile" },
    { name: "Notifications", href: "/account/notifications" },
    { name: "My Listings", href: "/account/listings" },
    { name: "My Bids & Wins", href: "/account/bids-and-wins" },
    { name: "My Shipments", href: "/account/shipments" },
  ];

  /*const styleClasses = {
    navLinks:
      "absolute right-full top-11 w-2/4 transition-all peer-checked:right-2/4 peer-checked:top-11 md:w-1/3 md:peer-checked:right-2/3 lg:static lg:flex lg:w-auto lg:justify-end lg:gap-2 lg:peer-checked:static lg:peer-checked:flex",
    navLink:
      "block w-full bg-green-200 p-2 text-left text-sm font-bold text-green-600 transition hover:bg-green-400 hover:text-green-100 lg:inline-block lg:w-32 lg:rounded lg:p-1 lg:text-center",
    profileLinks:
      "absolute left-full top-11 w-2/4 transition-all peer-checked:left-2/4 peer-checked:top-11 md:w-1/3 md:peer-checked:left-2/3 ",
    profileLink:
      "block w-full bg-green-200 p-2 text-left text-sm font-bold text-green-600 transition hover:bg-green-400 hover:text-green-100 lg:inline-block lg:w-32 lg:rounded lg:p-1 lg:text-center",
  };*/

  return (
    <div className="fixed rounded-md left-0 top-0 z-[100] w-full p-2 bg-white">
      <div className="m-auto max-w-5xl">
        {/*<Image src="/images/logo.jpg" alt="Logo" width={70} height={50} />*/}
        <nav id="" className="flex justify-between">
          <label
            ref={label}
            htmlFor="checkbox"
            className="py-0.5 lg:hidden cursor-pointer"
          >
            &#9776;
          </label>
          <input type="checkbox" id="checkbox" className="peer hidden" />

          <div
            ref={popupNav}
            className="absolute right-full bg-white top-0 flex h-screen w-3/4 flex-col shadow lg:shadow-none rounded-r-lg p-2 transition-all peer-checked:right-1/4 peer-checked:top-0 
                          md:w-1/3 md:peer-checked:right-2/3 lg:static 
                          lg:h-auto lg:w-full lg:flex-row lg:justify-end lg:p-0 overflow-auto lg:overflow-visible"
          >
            <div className="lg:flex lg:gap-1 relative">
              {user && (
                <div className="relative lg:order-2">
                  <label
                    ref={profileLabel}
                    htmlFor="profile-checkbox"
                    className="flex gap-2 hover:cursor-pointer"
                  >
                    <Avatar user={user} />
                    <span className="p-1 align-text-bottom text-sm font-bold ">
                      {user.email}
                    </span>
                  </label>
                  <input
                    type="checkbox"
                    id="profile-checkbox"
                    className="peer hidden"
                  />
                  <hr className="mb-2 mt-2 lg:hidden" />
                  <div className="lg:absolute lg:right-0 lg:shadow bg-white lg:top-9 lg:p-2 lg:hidden lg:rounded lg:w-full lg:peer-checked:block">
                    {profileLinks.map((link) => (
                      <Link
                        href={link.href as Url}
                        key={link.name}
                        className="block w-full rounded p-2 text-left text-sm transition hover:bg-gray-100 lg:w-full lg:text-center"
                      >
                        {link.name}
                      </Link>
                    ))}
                    <button
                      className="hidden rounded w-full p-2 text-left text-sm transition hover:bg-gray-100 lg:block lg:w-full lg:p-1 lg:text-center"
                      onClick={() => void signOut()}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
              {user && <hr className="mb-2 mt-2 lg:hidden" />}
              <Link href="/">
                <RiHome2Fill className="hidden text-2xl transition hover:bg-gray-100 lg:inline-block lg:text-center" />
              </Link>
              {/* FIXME: Chevron not toggling correctly on first click */}
              <div className="flex items-center p-2 lg:px-4 lg:py-1 transition lg:rounded hover:cursor-pointer hover:bg-gray-100">
                <label
                  ref={auctionsLabel}
                  htmlFor="auction-checkbox"
                  className="block cursor-pointer text-sm   hover:bg-gray-100 "
                  onClick={() => setChevron(!chevron)}
                >
                  Auctions
                </label>
                {!chevron ? (
                  <FiChevronRight className="inline" />
                ) : (
                  <FiChevronDown className="inline" />
                )}
              </div>
              <input
                type="checkbox"
                id="auction-checkbox"
                className="peer hidden"
              />
              <div className="lg:shadow lg:absolute bg-gray-100 lg:bg-white lg:top-9 lg:p-2 hidden left-6 rounded peer-checked:block lg:left-6">
                <Link
                  href="/live/listings"
                  className="w-full block rounded p-2 text-sm transition hover:bg-gray-200 lg:hover:bg-gray-100"
                >
                  Live
                </Link>

                <Link
                  href="/future/listings"
                  className="w-full block rounded p-2 text-sm transition hover:bg-gray-200 lg:hover:bg-gray-100"
                >
                  Upcoming
                </Link>

                <Link
                  href="/past/listings"
                  className="w-full block rounded p-2 text-sm transition hover:bg-gray-200 lg:hover:bg-gray-100"
                >
                  Past
                </Link>
              </div>
              <hr className="mb-2 mt-2 lg:hidden" />
              {navLinks.map((link) => (
                <Link
                  href={link.href as Url}
                  key={link.name}
                  className={clsx(
                    link.name === "Submit a Vehicle" &&
                      "bg-gray-900 text-white",
                    `block rounded p-2 text-left text-sm transition ${
                      link.name !== "Submit a Vehicle" && "hover:bg-gray-100"
                    } lg:inline-block lg:w-32 lg:p-1 lg:text-center`
                  )}
                >
                  {link.name}
                </Link>
              ))}

              {!user ? (
                <button
                  className="block w-full rounded p-2 text-left text-sm transition hover:bg-gray-100 lg:inline-block lg:w-32 lg:p-1 lg:text-center"
                  onClick={() => void signIn()}
                >
                  Sign in
                </button>
              ) : (
                <button
                  className="block w-full rounded p-2 text-left text-sm transition hover:bg-gray-100 lg:hidden"
                  onClick={() => void signOut()}
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default Header;
